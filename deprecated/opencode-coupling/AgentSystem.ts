import { Agent, type AgentConfig } from './Agent.js';
import {
  UnifiedAgent,
  type UnifiedAgentConfig,
  type UnifiedAgentResponse,
} from './UnifiedAgent.js';
import { EventBus } from './EventBus.js';
import { logger } from '../utils/logger.js';
import type { TransportMode } from './transports/index.js';

export interface AgentSystemConfig {
  maxAgents?: number;
  heartbeatIntervalMs?: number;
  agentConfig?: AgentConfig;
  unifiedAgentConfig?: UnifiedAgentConfig;
  defaultMode?: TransportMode;
}

export interface AgentInfo {
  id: string;
  agent: Agent;
  unifiedAgent?: UnifiedAgent;
  registeredAt: Date;
  lastActivity: Date;
  taskCount: number;
  status: 'idle' | 'busy' | 'error';
  mode: TransportMode;
}

export const AGENT_EVENTS = {
  AGENT_REGISTERED: 'agent:registered',
  AGENT_UNREGISTERED: 'agent:unregistered',
  AGENT_STATUS_CHANGED: 'agent:status:changed',
  AGENT_ERROR: 'agent:error',
  SYSTEM_STARTED: 'agent:system:started',
  SYSTEM_STOPPED: 'agent:system:stopped',
} as const;

export class AgentSystem {
  private readonly maxAgents: number;
  private readonly heartbeatIntervalMs: number;
  private readonly agentConfig: AgentConfig;
  private readonly unifiedAgentConfig: UnifiedAgentConfig;
  private readonly defaultMode: TransportMode;
  private readonly eventBus: EventBus;
  private readonly agents: Map<string, AgentInfo> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(config?: AgentSystemConfig, eventBus?: EventBus) {
    this.maxAgents = config?.maxAgents ?? 10;
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? 30000;
    this.agentConfig = config?.agentConfig ?? {};
    this.unifiedAgentConfig = config?.unifiedAgentConfig ?? {};
    this.defaultMode = config?.defaultMode ?? 'http';
    this.eventBus = eventBus ?? new EventBus();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('AgentSystem already running');
      return;
    }

    this.isRunning = true;

    this.heartbeatTimer = setInterval(() => {
      this.checkAgentsHealth();
    }, this.heartbeatIntervalMs);

    logger.info(`AgentSystem started (maxAgents: ${this.maxAgents})`);
    this.eventBus.publish(AGENT_EVENTS.SYSTEM_STARTED, {
      timestamp: new Date(),
      maxAgents: this.maxAgents,
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [, info] of this.agents) {
      info.status = 'idle';
    }

    logger.info('AgentSystem stopped');
    this.eventBus.publish(AGENT_EVENTS.SYSTEM_STOPPED, {
      timestamp: new Date(),
      agentCount: this.agents.size,
    });
  }

  registerAgent(agentId: string, config?: AgentConfig & { mode?: TransportMode }): Agent {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already registered`);
    }

    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum number of agents (${this.maxAgents}) reached`);
    }

    const mode = config?.mode ?? this.defaultMode;
    const agent = new Agent({ ...this.agentConfig, ...config });
    let unifiedAgent: UnifiedAgent | undefined;

    if (mode === 'cli') {
      unifiedAgent = new UnifiedAgent({
        ...this.unifiedAgentConfig,
        mode: 'cli',
        serverUrl: config?.serverUrl ?? this.unifiedAgentConfig.serverUrl,
      });
    }

    const now = new Date();

    const info: AgentInfo = {
      id: agentId,
      agent,
      unifiedAgent,
      registeredAt: now,
      lastActivity: now,
      taskCount: 0,
      status: 'idle',
      mode,
    };

    this.agents.set(agentId, info);

    logger.info(`Agent ${agentId} registered (mode: ${mode})`);
    this.eventBus.publish(AGENT_EVENTS.AGENT_REGISTERED, {
      agentId,
      timestamp: now,
      mode,
    });

    return agent;
  }

  unregisterAgent(agentId: string): void {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.agents.delete(agentId);

    logger.info(`Agent ${agentId} unregistered`);
    this.eventBus.publish(AGENT_EVENTS.AGENT_UNREGISTERED, {
      agentId,
      timestamp: new Date(),
      taskCount: info.taskCount,
    });
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  getUnifiedAgent(agentId: string): UnifiedAgent | undefined {
    return this.agents.get(agentId)?.unifiedAgent;
  }

  getAgentInfo(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  async executeWithAgent(
    agentId: string,
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (info.status === 'busy') {
      throw new Error(`Agent ${agentId} is busy`);
    }

    const previousStatus = info.status;
    info.status = 'busy';
    info.lastActivity = new Date();

    this.eventBus.publish(AGENT_EVENTS.AGENT_STATUS_CHANGED, {
      agentId,
      previousStatus,
      newStatus: 'busy',
      timestamp: info.lastActivity,
    });

    try {
      let result: { success: boolean; message?: string };

      if (info.mode === 'cli' && info.unifiedAgent) {
        const unifiedResult: UnifiedAgentResponse = await info.unifiedAgent.executeTask(task);
        result = { success: unifiedResult.success, message: unifiedResult.message };
      } else {
        result = await info.agent.executeTask(task);
      }

      info.taskCount++;
      info.status = result.success ? 'idle' : 'error';
      info.lastActivity = new Date();

      if (!result.success) {
        this.eventBus.publish(AGENT_EVENTS.AGENT_ERROR, {
          agentId,
          error: result.message,
          timestamp: info.lastActivity,
        });
      }

      this.eventBus.publish(AGENT_EVENTS.AGENT_STATUS_CHANGED, {
        agentId,
        previousStatus: 'busy',
        newStatus: info.status,
        timestamp: info.lastActivity,
      });

      return result;
    } catch (error) {
      info.status = 'error';
      info.lastActivity = new Date();

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.eventBus.publish(AGENT_EVENTS.AGENT_ERROR, {
        agentId,
        error: errorMessage,
        timestamp: info.lastActivity,
      });

      this.eventBus.publish(AGENT_EVENTS.AGENT_STATUS_CHANGED, {
        agentId,
        previousStatus: 'busy',
        newStatus: 'error',
        timestamp: info.lastActivity,
      });

      return { success: false, message: errorMessage };
    }
  }

  private checkAgentsHealth(): void {
    const now = new Date();
    const timeoutMs = this.heartbeatIntervalMs * 3;

    for (const [id, info] of this.agents) {
      const timeSinceLastActivity = now.getTime() - info.lastActivity.getTime();

      if (timeSinceLastActivity > timeoutMs && info.status !== 'idle') {
        logger.warn(`Agent ${id} may be stuck (status: ${info.status}, last activity: ${info.lastActivity.toISOString()}
  )`);

        if (info.status === 'busy') {
          info.status = 'error';
          this.eventBus.publish(AGENT_EVENTS.AGENT_STATUS_CHANGED, {
            agentId: id,
            previousStatus: 'busy',
            newStatus: 'error',
            timestamp: now,
          });
        }
      }
    }
  }

  getStats(): {
    totalAgents: number;
    idleAgents: number;
    busyAgents: number;
    errorAgents: number;
    totalTasksExecuted: number;
    agentsByMode: Record<TransportMode, number>;
  } {
    let idleAgents = 0;
    let busyAgents = 0;
    let errorAgents = 0;
    let totalTasksExecuted = 0;
    const agentsByMode: Record<TransportMode, number> = { http: 0, cli: 0 };

    for (const info of this.agents.values()) {
      totalTasksExecuted += info.taskCount;
      agentsByMode[info.mode]++;
      switch (info.status) {
        case 'idle':
          idleAgents++;
          break;
        case 'busy':
          busyAgents++;
          break;
        case 'error':
          errorAgents++;
          break;
      }
    }

    return {
      totalAgents: this.agents.size,
      idleAgents,
      busyAgents,
      errorAgents,
      totalTasksExecuted,
      agentsByMode,
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  registerCliAgent(agentId: string, config?: Omit<UnifiedAgentConfig, 'mode'>): Agent {
    return this.registerAgent(agentId, { ...config, mode: 'cli' } as AgentConfig & { mode: 'cli' });
  }

  getDefaultMode(): TransportMode {
    return this.defaultMode;
  }
}
