import {
  createTransport,
  type TransportMode,
  type StreamingCallback as TransportStreamingCallback,
  HttpTransport,
  CliTransport,
} from './transports/index.js';
import { ConversationLogger } from './ConversationLogger.js';
import { logger } from '../utils/logger.js';
import {
  categorizeError,
  formatErrorMessage,
  isRetryableError,
  type CategorizedError,
  ErrorClassifier,
} from '../utils/ErrorClassifier.js';
import { RetryExecutor, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../utils/RetryExecutor.js';
import {
  EnhancedCircuitBreaker,
  CircuitOpenError,
  type CircuitState,
} from '../utils/EnhancedCircuitBreaker.js';
import { ResponseCache, StaleResponseCache } from '../utils/ResponseCache.js';
import {
  createAgentMetrics,
  getMetricsRegistry,
  type TransportHealth,
  type AgentHealth,
} from '../services/MetricsService.js';
import type { DatabaseClient } from '../db/DatabaseClient.js';

export { type StreamingCallback } from './transports/index.js';

const MAX_MESSAGE_LENGTH = 100000;
const MAX_TASK_TITLE_LENGTH = 500;
const MAX_TASK_DESCRIPTION_LENGTH = 5000;

interface AgentMetrics {
  executionTotal: ReturnType<typeof createAgentMetrics>;
  correlationId: string;
}

function sanitizeForLog(input: string, maxLength: number = 200): string {
  // eslint-disable-next-line no-control-regex
  const sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  return sanitized.slice(0, maxLength) + '...';
}

function containsSensitivePattern(text: string): boolean {
  const sensitivePatterns = [
    /password["\s]*[:=]["\s]*[^"\s]+/i,
    /api[_-]?key["\s]*[:=]["\s]*[^"\s]+/i,
    /secret["\s]*[:=]["\s]*[^"\s]+/i,
    /token["\s]*[:=]["\s]*[^"\s]+/i,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    /-----BEGIN CERTIFICATE-----/,
  ];
  return sensitivePatterns.some(pattern => pattern.test(text));
}

function maskSensitiveData(input: string): string {
  const patterns = [
    { regex: /(password["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(api[_-]?key["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(secret["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(token["\s]*[:=]["\s]*)([^"\s]+)/gi, replacement: '$1***' },
    { regex: /(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, replacement: '$1***' },
  ];

  let result = input;
  for (const { regex, replacement } of patterns) {
    result = result.replace(regex, replacement);
  }
  return result;
}

function validateInputLength(message: string, maxLength: number): void {
  if (message.length > maxLength) {
    throw new Error(`Input exceeds maximum allowed length of ${maxLength} characters`);
  }
}

function generateCorrelationId(): string {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

export interface UnifiedAgentConfig {
  mode?: TransportMode;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  serverUrl?: string;
  logDir?: string;
  enableLogging?: boolean;
  correlationId?: string;
  fallbackMode?: TransportMode;
  enableFallback?: boolean;
  enableCache?: boolean;
  enableObservability?: boolean;
  cacheTtlMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  retryPolicy?: Partial<RetryPolicy>;
  dbClient?: DatabaseClient;
  projectId?: string;
}

export interface AgentTask {
  id?: string;
  title: string;
  description: string;
  context?: string;
}

export interface UnifiedAgentResponse {
  success: boolean;
  message?: string;
  output?: string;
  artifacts?: string[];
  sessionId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCategory?: string;
  fallbackUsed?: boolean;
  fromCache?: boolean;
  serverUnavailable?: boolean;
}

export interface TaskMetrics {
  success: boolean;
  durationMs: number;
  attemptCount: number;
  transportMode: TransportMode;
  correlationId: string;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

export interface ResilienceStats {
  circuitBreaker: CircuitState;
  cacheHitRate: number;
  retryCount: number;
  lastError?: CategorizedError;
}

/**
 * UnifiedAgent - Main agent class that provides a unified interface for AI task execution
 * with support for both HTTP and CLI transports, with automatic failover and caching.
 *
 * @example
 * ```typescript
 * import { UnifiedAgent } from './core/UnifiedAgent';
 *
 * const agent = new UnifiedAgent({
 *   mode: 'http',
 *   serverUrl: 'http://localhost:4096',
 *   enableFallback: true,
 *   fallbackMode: 'cli',
 * });
 *
 * const result = await agent.executeTask('Fix the login bug');
 * console.log(result.message);
 * ```
 */
export class UnifiedAgent {
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly retryDelay: number;
  protected readonly serverUrl: string;
  protected readonly transportMode: TransportMode;
  private readonly conversationLogger: ConversationLogger | null;
  protected readonly enableLogging: boolean;
  protected transport: HttpTransport | CliTransport;
  protected fallbackTransport: HttpTransport | CliTransport | null = null;
  protected currentMode: TransportMode;

  protected circuitBreaker: EnhancedCircuitBreaker;
  protected retryExecutor: RetryExecutor;
  protected responseCache: ResponseCache<string>;
  protected staleCache: StaleResponseCache<string>;
  protected errorClassifier: ErrorClassifier;

  protected readonly enableFallback: boolean;
  protected readonly enableCache: boolean;
  protected readonly cacheTtlMs: number;

  protected readonly agentMetrics: AgentMetrics;
  protected readonly instanceId: string;
  protected readonly enableObservability: boolean;

  private static readonly healthChecks = new Map<string, () => Promise<boolean>>();

  /**
   * Creates a new UnifiedAgent instance with the specified configuration.
   *
   * @param config - Optional configuration object
   * @param config.mode - Transport mode: 'http' or 'cli' (default: 'http')
   * @param config.timeout - Request timeout in milliseconds (default: 600000)
   * @param config.maxRetries - Maximum retry attempts (default: 3)
   * @param config.retryDelay - Initial retry delay in milliseconds (default: 1000)
   * @param config.serverUrl - Server URL for HTTP transport (default: 'http://localhost:4096')
   * @param config.logDir - Directory for conversation logs (default: 'conversations')
   * @param config.enableLogging - Enable conversation logging (default: true)
   * @param config.enableFallback - Enable automatic fallback (default: false)
   * @param config.fallbackMode - Fallback transport mode when primary fails
   * @param config.enableCache - Enable response caching (default: true)
   * @param config.cacheTtlMs - Cache TTL in milliseconds (default: 300000)
   * @param config.circuitBreakerThreshold - Circuit breaker failure threshold (default: 3)
   * @param config.circuitBreakerResetMs - Circuit breaker reset timeout (default: 300000)
   * @param config.enableObservability - Enable metrics and health checks (default: true)
   */
  constructor(config?: UnifiedAgentConfig) {
    this.timeout = config?.timeout ?? 600000;
    this.maxRetries = config?.maxRetries ?? 3;
    this.retryDelay = config?.retryDelay ?? 1000;
    this.serverUrl = config?.serverUrl ?? 'http://localhost:4096';
    this.transportMode = config?.mode ?? 'http';
    this.currentMode = this.transportMode;
    this.enableLogging = config?.enableLogging ?? true;
    this.enableFallback = config?.enableFallback ?? false;
    this.enableCache = config?.enableCache ?? true;
    this.cacheTtlMs = config?.cacheTtlMs ?? 5 * 60 * 1000;
    this.enableObservability = config?.enableObservability ?? true;
    this.instanceId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    if (this.enableLogging) {
      this.conversationLogger = new ConversationLogger(
        config?.logDir ?? 'conversations',
        config?.dbClient,
        config?.projectId
      );
    } else {
      this.conversationLogger = null;
    }

    this.agentMetrics = {
      executionTotal: createAgentMetrics('nezha_unified_agent'),
      correlationId: config?.correlationId ?? generateCorrelationId(),
    };

    if (this.enableObservability) {
      this.registerHealthCheck();
      this.logStructured('agent_initialized', {
        mode: this.transportMode,
        serverUrl: this.serverUrl,
        timeout: this.timeout,
        enableObservability: this.enableObservability,
        instanceId: this.instanceId,
      });
    }

    this.transport = createTransport({
      serverUrl: this.serverUrl,
      timeout: this.timeout,
    }) as HttpTransport;

    if (this.enableFallback && config?.fallbackMode) {
      this.fallbackTransport = createTransport({
        serverUrl: this.serverUrl,
        timeout: this.timeout,
      }) as HttpTransport;
    }

    const circuitBreakerConfig = {
      failureThreshold: config?.circuitBreakerThreshold ?? 9999,
      resetTimeoutMs: config?.circuitBreakerResetMs ?? 5 * 60 * 1000,
      halfOpenAttempts: 1,
      onStateChange: (from: CircuitState, to: CircuitState) => {
        if (to === 'open') {
          logger.warn(
            `Circuit breaker would open, but is disabled (high threshold). Server may be unavailable.`
          );
        }
      },
      onFailure: (error: Error, count: number) => {
        const categorized = categorizeError(error);
        logger.debug(`Circuit breaker check [${categorized.category}]: ${error.message}`);
      },
    };

    this.circuitBreaker = new EnhancedCircuitBreaker(circuitBreakerConfig);

    const retryPolicy: RetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      maxAttempts: this.maxRetries,
      initialDelayMs: this.retryDelay,
      ...config?.retryPolicy,
    };
    this.retryExecutor = new RetryExecutor(retryPolicy);

    this.responseCache = new ResponseCache<string>({ ttlMs: this.cacheTtlMs });
    this.staleCache = new StaleResponseCache<string>(this.cacheTtlMs, 50);
    this.errorClassifier = new ErrorClassifier();
  }

  private logStructured(event: string, data: Record<string, unknown>): void {
    if (this.enableObservability) {
      logger.info(event, {
        component: 'UnifiedAgent',
        instanceId: this.instanceId,
        transportMode: this.transportMode,
        ...data,
      });
    }
  }

  private registerHealthCheck(): void {
    const checkName = `unified_agent_${this.instanceId}`;
    UnifiedAgent.healthChecks.set(checkName, () => this.checkHealth());
  }

  private async checkHealth(): Promise<boolean> {
    try {
      if (this.transportMode === 'http') {
        const start = Date.now();
        await fetch(`${this.serverUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return Date.now() - start < 5000;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the health status of the agent and its transports.
   * Checks server connectivity and transport health.
   *
   * @returns Promise resolving to agent health status
   */
  async getHealth(): Promise<AgentHealth> {
    const transports: TransportHealth[] = [];
    let serverConnectivity = false;

    try {
      if (this.transportMode === 'http') {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch(`${this.serverUrl}/health`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          serverConnectivity = response.ok;
          transports.push({
            mode: 'http',
            healthy: response.ok,
            lastCheck: new Date(),
            latencyMs: Date.now() - start,
          });
        } catch (error) {
          clearTimeout(timeoutId);
          transports.push({
            mode: 'http',
            healthy: false,
            lastCheck: new Date(),
            error: error instanceof Error ? error.message : 'Connection failed',
          });
        }
      } else {
        transports.push({
          mode: 'cli',
          healthy: true,
          lastCheck: new Date(),
        });
      }
    } catch {
      serverConnectivity = false;
    }

    return {
      healthy: serverConnectivity || this.transportMode === 'cli',
      timestamp: new Date(),
      serverConnectivity,
      transports,
    };
  }

  /**
   * Returns execution metrics for the agent.
   *
   * @returns Object containing totalExecutions, avgDurationMs, activeConnections, tokenUsageTotal
   */
  getMetrics(): {
    totalExecutions: number;
    avgDurationMs: number;
    activeConnections: number;
    tokenUsageTotal: number;
  } {
    const execMetrics = this.agentMetrics.executionTotal;
    return {
      totalExecutions: execMetrics.executionTotal.value,
      avgDurationMs:
        execMetrics.executionDurationSeconds.count > 0
          ? (execMetrics.executionDurationSeconds.sum /
              execMetrics.executionDurationSeconds.count) *
            1000
          : 0,
      activeConnections: execMetrics.activeConnections.value,
      tokenUsageTotal: execMetrics.tokenUsage.value,
    };
  }

  /**
   * Exports all metrics in Prometheus format.
   *
   * @returns Metrics in Prometheus text format
   */
  exportMetrics(): string {
    return getMetricsRegistry().export();
  }

  /**
   * Returns the correlation ID for this agent instance.
   * Used for request tracing across services.
   *
   * @returns The correlation ID string
   */
  getCorrelationId(): string {
    return this.agentMetrics.correlationId;
  }

  private recordTokenUsage(response: string): void {
    if (!this.enableObservability) return;
    const tokenPattern = /token[_\s]?usage[:\s]+(\d+)/gi;
    let match;
    let totalTokens = 0;

    while ((match = tokenPattern.exec(response)) !== null) {
      const tokenCount = match[1];
      if (tokenCount) {
        totalTokens += parseInt(tokenCount, 10);
      }
    }

    if (totalTokens > 0) {
      this.agentMetrics.executionTotal.tokenUsage.inc(totalTokens);
    }
  }

  private recordDuration(durationMs: number): void {
    if (!this.enableObservability) return;
    this.agentMetrics.executionTotal.executionDurationSeconds.observe(durationMs / 1000);
  }

  private recordExecution(): void {
    if (!this.enableObservability) return;
    this.agentMetrics.executionTotal.executionTotal.inc();
  }

  private switchMode(mode: TransportMode): void {
    if (this.currentMode === mode) return;
    logger.info(`Switching transport mode: ${this.currentMode} -> ${mode}`);
    this.currentMode = mode;
  }

  private getCurrentTransport(): HttpTransport | CliTransport {
    return this.currentMode === this.transportMode
      ? this.transport
      : (this.fallbackTransport ?? this.transport);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculates retry delay with exponential backoff and jitter.
   *
   * @param attempt - The current retry attempt number (1-indexed)
   * @returns The delay in milliseconds before the next retry
   */
  public calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 30000);
  }

  private getCacheKey(message: string): string {
    return `msg_${Buffer.from(message).toString('base64').slice(0, 64)}`;
  }

  /**
   * Executes a task by sending a message to the AI agent.
   * Implements retry logic, circuit breaker, and caching.
   *
   * @param message - The task description or instruction (max 100000 chars)
   * @returns Promise resolving to the unified agent response
   * @throws Error if input exceeds maximum length
   */
  async executeTask(message: string): Promise<UnifiedAgentResponse> {
    validateInputLength(message, MAX_MESSAGE_LENGTH);
    return this.executeWithRetry(message);
  }

  /**
   * Executes a structured task with title, description, and optional context.
   * Builds a prompt from the task structure and executes it.
   *
   * @param task - The structured task object
   * @param task.title - Task title (max 500 chars)
   * @param task.description - Task description (max 5000 chars)
   * @param task.context - Optional additional context
   * @param systemPrompt - Optional system prompt to prepend
   * @returns Promise resolving to the unified agent response
   * @throws Error if title or description exceeds maximum length
   */
  async executeStructuredTask(
    task: AgentTask,
    systemPrompt?: string
  ): Promise<UnifiedAgentResponse> {
    if (task.title.length > MAX_TASK_TITLE_LENGTH) {
      throw new Error(`Task title exceeds maximum length of ${MAX_TASK_TITLE_LENGTH}`);
    }
    if (task.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
      throw new Error(`Task description exceeds maximum length of ${MAX_TASK_DESCRIPTION_LENGTH}`);
    }
    const fullPrompt = this.buildStructuredPrompt(task, systemPrompt);
    return this.executeWithRetry(fullPrompt, task);
  }

  /**
   * Executes a task with streaming response callback.
   * Only available in CLI transport mode.
   *
   * @param message - The task description or instruction
   * @param onChunk - Callback function invoked for each streaming chunk
   * @returns Promise resolving to the unified agent response
   * @throws Error if not using CLI transport mode
   */
  async executeTaskStreaming(
    message: string,
    onChunk: TransportStreamingCallback
  ): Promise<UnifiedAgentResponse> {
    if (this.transportMode !== 'cli') {
      throw new Error('Streaming is only supported in CLI mode');
    }

    const cliTransport = this.transport as CliTransport;
    const sessionId = this.conversationLogger?.startConversation(
      { id: crypto.randomUUID(), title: message, description: message },
      'task_execution'
    );

    try {
      this.conversationLogger?.addMessage('user', message);
      const response = await cliTransport.sendMessageStreaming(message, onChunk);
      const artifacts = this.extractArtifacts(response);

      this.conversationLogger?.addMessage('assistant', response);
      await this.conversationLogger?.endConversation({
        success: true,
        output: response,
        artifacts,
      });

      return {
        success: true,
        message: response,
        output: response,
        artifacts,
        sessionId: sessionId || undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const artifacts = this.extractArtifacts(errorMessage);

      await this.conversationLogger?.endConversation({
        success: false,
        output: errorMessage,
        artifacts: [],
      });

      return {
        success: false,
        message: errorMessage,
        output: errorMessage,
        artifacts,
        sessionId: sessionId || undefined,
      };
    }
  }

  protected async executeWithRetry(
    message: string,
    task?: AgentTask
  ): Promise<UnifiedAgentResponse> {
    const startTime = Date.now();

    if (this.transportMode === 'http') {
      const healthCheck = await HttpTransport.checkServerHealth(this.serverUrl);
      if (!healthCheck.healthy) {
        logger.warn(
          `OpenCode server unavailable (${this.serverUrl}): ${healthCheck.error}. Will retry on request.`
        );
      }
    }

    const sessionId = this.conversationLogger?.startConversation(
      {
        id: task?.id || crypto.randomUUID(),
        title: task?.title || message,
        description: task?.description || message,
      },
      'task_execution'
    );

    try {
      this.conversationLogger?.addMessage('user', message);
    } catch (error) {
      logger.debug('ConversationLogger unavailable:', error);
    }

    const cacheKey = this.getCacheKey(message);
    const fallbackUsed = false;
    let fromCache = false;

    if (this.enableCache) {
      const cached = this.responseCache.get([message]);
      if (cached) {
        logger.info('Returning cached response');
        fromCache = true;
        return {
          success: true,
          message: cached.data,
          output: cached.data,
          artifacts: this.extractArtifacts(cached.data),
          sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
          durationMs: Date.now() - startTime,
          fromCache,
        };
      }
    }

    const sendMessage = async (): Promise<string> => {
      return this.getCurrentTransport().sendMessage(message);
    };

    let lastError: Error | null = null;
    let lastCategorizedError: CategorizedError | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const logMessage = containsSensitivePattern(message)
          ? '[Contains sensitive data]'
          : sanitizeForLog(message, 100);
        logger.info(
          `Executing task (attempt ${attempt}/${this.maxRetries}, mode: ${this.currentMode}): ${logMessage}`
        );

        const result = await sendMessage();
        const artifacts = this.extractArtifacts(result);

        if (this.enableCache) {
          this.responseCache.set([message], result);
          this.staleCache.set(cacheKey, result);
        }

        try {
          this.conversationLogger?.addMessage('assistant', result);
          await this.conversationLogger?.endConversation({
            success: true,
            output: result,
            artifacts,
          });
        } catch (error) {
          logger.debug('Failed to log conversation:', error);
        }

        logger.info(`Task completed successfully`);

        return {
          success: true,
          message: result,
          output: result,
          artifacts,
          sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
          durationMs: Date.now() - startTime,
          fromCache,
          fallbackUsed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        lastCategorizedError = categorizeError(lastError);
        const sanitizedError = maskSensitiveData(lastError.message);

        if (lastError instanceof CircuitOpenError) {
          logger.warn(`Circuit breaker open: ${lastError.message}`);
        } else {
          logger.error(
            `Task execution error [${lastCategorizedError.category}]: ${sanitizedError}`
          );
        }

        if (lastCategorizedError.category === 'AUTH') {
          logger.warn('Authentication error - retrying (server may need configuration)');
        }

        if (lastError.name === 'AbortError') {
          this.getCurrentTransport().clearSession();
        }

        if (lastError.message.includes('session')) {
          this.getCurrentTransport().clearSession();
        }

        if (this.enableFallback && !fallbackUsed && this.fallbackTransport && attempt === 1) {
          const staleResponse = this.staleCache.getStale(cacheKey);
          if (staleResponse) {
            logger.warn('Using stale cached response due to errors');
            return {
              success: true,
              message: staleResponse.data,
              output: staleResponse.data,
              artifacts: this.extractArtifacts(staleResponse.data),
              sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
              durationMs: Date.now() - startTime,
              fromCache: false,
              fallbackUsed: true,
            };
          }

          logger.info('Primary transport failed, attempting fallback');
          this.switchMode(this.transportMode === 'http' ? 'cli' : 'http');
        }

        if (attempt < this.maxRetries && isRetryableError(lastError)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`Retrying after ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
      }
    }

    const errorMessage = lastCategorizedError
      ? formatErrorMessage(lastCategorizedError)
      : `Task failed after ${this.maxRetries} attempts: ${lastError ? maskSensitiveData(lastError.message) : 'Unknown error'}`;

    try {
      await this.conversationLogger?.endConversation({
        success: false,
        output: errorMessage,
        artifacts: [],
      });
    } catch (error) {
      logger.debug('Failed to log failed conversation:', error);
    }

    return {
      success: false,
      message: errorMessage,
      output: errorMessage,
      artifacts: [],
      sessionId: this.getCurrentTransport().getSessionId() || sessionId || undefined,
      durationMs: Date.now() - startTime,
      errorCategory: lastCategorizedError?.category,
      fallbackUsed,
      serverUnavailable:
        lastCategorizedError?.category === 'AUTH' || lastCategorizedError?.category === 'TRANSPORT',
    };
  }

  protected buildStructuredPrompt(task: AgentTask, systemPrompt?: string): string {
    const defaultSystem = `You are an AI assistant helping with software development tasks.
You have access to the Nezha system which provides:
- Memory system for storing and retrieving knowledge
- Semantic search for finding relevant past experiences
- Task scheduling and execution
- Conversation logging for learning`;

    const combinedSystem = systemPrompt ? `${defaultSystem}\n\n${systemPrompt}` : defaultSystem;

    return `System: ${combinedSystem}

Task: ${task.title}
Description: ${task.description}
${task.context ? `Context: ${task.context}` : ''}

Please analyze the task and provide a detailed solution.`;
  }

  protected static extractArtifactsStatic(content: string): string[] {
    const artifacts: string[] = [];
    const filePattern =
      /(?:file|created|modified|updated):\s*([^\s]+\.(ts|js|json|md|txt|tsx|jsx|yaml|yml))/gi;
    let match;

    while ((match = filePattern.exec(content)) !== null) {
      const filename = match[1];
      if (filename && !artifacts.includes(filename)) {
        artifacts.push(filename);
      }
    }

    return artifacts;
  }

  protected extractArtifacts(content: string): string[] {
    return UnifiedAgent.extractArtifactsStatic(content);
  }

  /**
   * Clears the current session for both primary and fallback transports.
   * Useful for resetting state when authentication expires or server restarts.
   */
  clearSession(): void {
    this.transport.clearSession();
    this.fallbackTransport?.clearSession();
  }

  /**
   * Returns the current session ID from the active transport.
   *
   * @returns The session ID or null if no session exists
   */
  getSessionId(): string | null {
    return this.getCurrentTransport().getSessionId();
  }

  /**
   * Returns resilience statistics including circuit breaker state,
   * cache hit rate, and retry count.
   *
   * @returns Object containing circuitBreaker state, cacheHitRate, retryCount, lastError
   */
  getResilienceStats(): ResilienceStats {
    return {
      circuitBreaker: this.circuitBreaker.getState().state,
      cacheHitRate: this.responseCache.getStats().hitRate,
      retryCount: this.retryExecutor.getAttemptHistory().length,
      lastError: undefined,
    };
  }

  /**
   * Resets all resilience mechanisms:
   * - Circuit breaker
   * - Retry executor
   * - Response cache
   * - Stale cache
   * - Transport mode to primary
   */
  resetCircuits(): void {
    this.circuitBreaker.reset();
    this.retryExecutor.reset();
    this.responseCache.clear();
    this.staleCache.clear();
    this.currentMode = this.transportMode;
  }
}

/**
 * Agent class - HTTP-only agent for backward compatibility.
 * Use UnifiedAgent for new code to get dual-mode transport support.
 *
 * @example
 * ```typescript
 * import { Agent } from './core/UnifiedAgent';
 *
 * const agent = new Agent({ serverUrl: 'http://localhost:4096' });
 * const result = await agent.executeTask('Fix the login bug');
 * ```
 */
export class Agent extends UnifiedAgent {
  /**
   * Creates a new Agent instance using HTTP transport.
   * @param config - Optional configuration (mode is always 'http')
   */
  constructor(config?: Omit<UnifiedAgentConfig, 'mode'>) {
    super({ ...config, mode: 'http' });
  }

  /**
   * Executes a task via HTTP transport.
   * Simplified response compared to UnifiedAgent.
   *
   * @param message - The task description
   * @returns Promise resolving to simplified response with success, message, sessionId
   */
  async executeTask(
    message: string
  ): Promise<{ success: boolean; message?: string; sessionId?: string }> {
    const result = await this.executeWithRetry(message);
    return {
      success: result.success,
      message: result.message,
      sessionId: result.sessionId,
    };
  }
}

/**
 * CliAgent - CLI transport agent for local execution.
 * Spawns opencode CLI process for task execution.
 *
 * @example
 * ```typescript
 * import { CliAgent } from './core/UnifiedAgent';
 *
 * const agent = new CliAgent({ serverUrl: 'http://localhost:4096' });
 * const result = await agent.executeTask('Create a new component');
 *
 * // With streaming
 * await agent.executeTaskStreaming('Analyze the codebase', (chunk, type) => {
 *   console.log(`[${type}] ${chunk}`);
 * });
 * ```
 */
export class CliAgent extends UnifiedAgent {
  /**
   * Creates a new CliAgent instance using CLI transport.
   * Automatically enables logging.
   *
   * @param config - Optional configuration (mode is always 'cli')
   */
  constructor(config?: Omit<UnifiedAgentConfig, 'mode'>) {
    super({ ...config, mode: 'cli', enableLogging: true });
  }
}
