import { TaskCoordinator, TaskContext } from '../coordinator/TaskCoordinator.js';
import { getNuPIClient } from '@nezha/nupi';

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_EVERY_N_CYCLES = 12;
const IDLE_THRESHOLD_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const MAX_TITLE_LENGTH = 500;
const MAX_RESULT_LENGTH = 10_000;

export interface EngineConfig {
  opencodeUrl: string;
  opencodeAuth?: { username: string; password: string };
  pollIntervalMs?: number;
  useAuth?: boolean;
}

function sanitizeForSql(value: string, maxLength: number): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .slice(0, maxLength);
}

export class ContinuousWorkEngine {
  private coordinator: TaskCoordinator;
  private config: EngineConfig;
  private api = getNuPIClient();
  private running = false;
  private shuttingDown = false;
  private currentTaskPromise: Promise<void> | null = null;
  private consecutiveErrors = 0;
  private readonly pollIntervalMs: number;

  constructor(config: EngineConfig) {
    this.coordinator = new TaskCoordinator({
      opencodeUrl: config.opencodeUrl,
      opencodeAuth: config.opencodeAuth,
      useAuth: config.useAuth,
    });
    this.config = config;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.shuttingDown = false;
    this.consecutiveErrors = 0;

    const onSignal = async (signal: string) => {
      console.log(`[ContinuousWorkEngine] Received ${signal}, shutting down...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => onSignal('SIGINT'));
    process.on('SIGTERM', () => onSignal('SIGTERM'));

    console.log('[ContinuousWorkEngine] Starting...');
    this.runLoop();
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.running = false;
    console.log('[ContinuousWorkEngine] Stopping, waiting for in-flight tasks...');

    if (this.currentTaskPromise) {
      await this.currentTaskPromise;
    }

    console.log('[ContinuousWorkEngine] Stopped');
  }

  getCoordinator(): TaskCoordinator {
    return this.coordinator;
  }

  private async heartbeat() {
    const sessionId = this.coordinator.getSessionId();
    if (!sessionId) return;

    const isAlive = await this.coordinator.isSessionAlive();
    if (!isAlive) {
      console.log('[ContinuousWorkEngine] Session dead, creating new one...');
      await this.coordinator.execute({ id: '', title: 'heartbeat', priority: 0 });
    }
  }

  private async analyzeResultAndCreateTasks(
    task: TaskContext,
    result: { executor: string; result: string }
  ) {
    const resultText = result.result.toLowerCase();

    if (resultText.includes('error') || resultText.includes('fail')) {
      const safeTitle = sanitizeForSql(task.title, MAX_TITLE_LENGTH);
      const safeResult = sanitizeForSql(result.result, MAX_RESULT_LENGTH);
      await this.api.createTask({
        title: `Fix: ${safeTitle}`,
        description: `Execution failed: ${safeResult}`,
        priority: task.priority + 10,
      });
    }

    if (resultText.includes('todo') || resultText.includes('follow-up')) {
      const match = resultText.match(/todo[:\s]+(.+?)(?:\n|$)/i);
      if (match?.[1]) {
        const safeTodo = sanitizeForSql(match[1].trim(), MAX_TITLE_LENGTH);
        await this.api.createTask({
          title: safeTodo,
          description: `Decomposed from task ${sanitizeForSql(task.title, MAX_TITLE_LENGTH)}`,
          priority: task.priority,
        });
      }
    }
  }

  private getBackoffDelay(): number {
    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, this.consecutiveErrors),
      BACKOFF_MAX_MS
    );
    return Math.round(delay);
  }

  private async runLoop() {
    let heartbeatCounter = 0;
    while (this.running) {
      try {
        if (!this.shuttingDown) {
          this.currentTaskPromise = this.processOneTask();
          await this.currentTaskPromise;
        }

        this.consecutiveErrors = 0;

        heartbeatCounter++;
        if (heartbeatCounter >= HEARTBEAT_EVERY_N_CYCLES) {
          await this.heartbeat();
          heartbeatCounter = 0;
        }
      } catch (error) {
        this.consecutiveErrors++;
        const backoff = this.getBackoffDelay();
        console.error(
          `[ContinuousWorkEngine] Error in loop (${this.consecutiveErrors} consecutive):`,
          error instanceof Error ? error.message : error
        );
        console.log(`[ContinuousWorkEngine] Backing off ${backoff}ms before next cycle...`);

        if (this.shuttingDown) break;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      if (this.shuttingDown) break;
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async processOneTask() {
    const task = await this.fetchNextTask();
    if (!task) return;

    console.log(`[ContinuousWorkEngine] Processing task: ${task.title}`);

    await this.api.updateTaskStatus(task.id, 'RUNNING');

    try {
      const result = await this.coordinator.execute(task);

      await this.saveLearning(task, result);
      await this.api.updateTaskResult(task.id, result);
      await this.api.updateTaskStatus(task.id, 'COMPLETED');
      await this.analyzeResultAndCreateTasks(task, result);

      console.log(`[ContinuousWorkEngine] Task completed: ${task.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.api.updateTaskError(task.id, errorMsg);
      await this.api.updateTaskStatus(task.id, 'FAILED');
      console.error(`[ContinuousWorkEngine] Task failed: ${task.title}`, errorMsg);
    }
  }

  private async fetchNextTask(): Promise<TaskContext | null> {
    try {
      const task = await this.api.getPendingTask(1);
      if (!task) return null;
      return {
        id: task.id,
        title: task.title,
        description: task.description || undefined,
        priority: task.priority,
      };
    } catch (error) {
      console.error('[ContinuousWorkEngine] Failed to fetch next task:', error);
      return null;
    }
  }

  private async saveLearning(task: TaskContext, result: { executor: string; result: string }) {
    const content = `Task completed: ${task.title}\nExecutor: ${result.executor}\nResult: ${result.result}`;

    try {
      await this.api.saveMemory(content, ['task', 'completed', task.priority >= 50 ? 'high-priority' : 'normal']);
    } catch (error) {
      console.warn('[ContinuousWorkEngine] Failed to save learning:', error);
    }
  }
}
