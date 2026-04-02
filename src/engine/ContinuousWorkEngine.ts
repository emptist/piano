import { TaskCoordinator, TaskContext } from '../coordinator/TaskCoordinator.js';
import { Pool } from 'pg';

export interface EngineConfig {
  dbPool: Pool;
  opencodeUrl: string;
  opencodeAuth?: { username: string; password: string };
  pollIntervalMs: number;
  useAuth?: boolean;
}

export class ContinuousWorkEngine {
  private coordinator: TaskCoordinator;
  private config: EngineConfig;
  private pool: Pool;
  private running = false;

  constructor(config: EngineConfig) {
    this.coordinator = new TaskCoordinator({
      opencodeUrl: config.opencodeUrl,
      opencodeAuth: config.opencodeAuth,
      useAuth: config.useAuth,
    });
    this.config = config;
    this.pool = config.dbPool;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log('[ContinuousWorkEngine] Starting...');
    this.runLoop();
  }

  async stop() {
    this.running = false;
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
      await this.pool.query(
        `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3)`,
        [`修复: ${task.title}`, `执行失败: ${result.result}`, task.priority + 10]
      );
    }

    if (resultText.includes('todo') || resultText.includes('后续')) {
      const match = resultText.match(/todo[:\s]+(.+?)(?:\n|$)/i);
      if (match?.[1]) {
        await this.pool.query(
          `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3)`,
          [match[1].trim(), `从任务 ${task.title} 分解`, task.priority]
        );
      }
    }
  }

  private async runLoop() {
    let heartbeatCounter = 0;
    while (this.running) {
      try {
        await this.processOneTask();

        heartbeatCounter++;
        if (heartbeatCounter >= 12) {
          await this.heartbeat();
          heartbeatCounter = 0;
        }
      } catch (error) {
        console.error('[ContinuousWorkEngine] Error in loop:', error);
      }

      await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs));
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
