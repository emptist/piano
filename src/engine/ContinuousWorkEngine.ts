import { TaskCoordinator, TaskContext } from '../coordinator/TaskCoordinator.js';
import { Pool } from 'pg';

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_EVERY_N_CYCLES = 12;
const IDLE_THRESHOLD_MS = 60_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const MAX_TITLE_LENGTH = 500;
const MAX_RESULT_LENGTH = 10_000;

export interface EngineConfig {
  dbPool: Pool;
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
  private pool: Pool;
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
    this.pool = config.dbPool;
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
      await this.pool.query(
        `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3)`,
        [`修复: ${safeTitle}`, `执行失败: ${safeResult}`, task.priority + 10]
      );
    }

    if (resultText.includes('todo') || resultText.includes('后续')) {
      const match = resultText.match(/todo[:\s]+(.+?)(?:\n|$)/i);
      if (match?.[1]) {
        const safeTodo = sanitizeForSql(match[1].trim(), MAX_TITLE_LENGTH);
        const safeTitle = sanitizeForSql(task.title, MAX_TITLE_LENGTH);
        await this.pool.query(
          `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3)`,
          [safeTodo, `从任务 ${safeTitle} 分解`, task.priority]
        );
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

    await this.updateTaskStatus(task.id, 'RUNNING');

    try {
      const result = await this.coordinator.execute(task);

      await this.saveLearning(task, result);
      await this.updateTaskResult(task.id, result);
      await this.updateTaskStatus(task.id, 'COMPLETED');
      await this.analyzeResultAndCreateTasks(task, result);

      console.log(`[ContinuousWorkEngine] Task completed: ${task.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.updateTaskError(task.id, errorMsg);
      await this.updateTaskStatus(task.id, 'FAILED');
      console.error(`[ContinuousWorkEngine] Task failed: ${task.title}`, errorMsg);
    }
  }

  private async fetchNextTask(): Promise<TaskContext | null> {
    const result = await this.pool.query(
      `SELECT id, title, description, priority 
       FROM tasks 
       WHERE status = 'PENDING' 
       ORDER BY priority DESC, created_at ASC 
       LIMIT 1`
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
    };
  }

  private async updateTaskStatus(id: string, status: string) {
    await this.pool.query(`UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`, [
      status,
      id,
    ]);
  }

  private async updateTaskResult(id: string, result: { executor: string; result: string }) {
    await this.pool.query(`UPDATE tasks SET result = $1, completed_at = NOW() WHERE id = $2`, [
      JSON.stringify(result),
      id,
    ]);
  }

  private async updateTaskError(id: string, error: string) {
    await this.pool.query(`UPDATE tasks SET error = $1, updated_at = NOW() WHERE id = $2`, [
      error,
      id,
    ]);
  }

  private async saveLearning(task: TaskContext, result: { executor: string; result: string }) {
    const content = `任务完成: ${task.title}\n执行器: ${result.executor}\n结果: ${result.result}`;

    await this.pool.query(
      `INSERT INTO memory (content, source, tags) VALUES ($1, 'piano-engine', $2)`,
      [content, ['task', 'completed', task.priority >= 50 ? 'high-priority' : 'normal']]
    );
  }
}
