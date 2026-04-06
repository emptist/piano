import type { PiExecutorInterface, PiTaskResult, PiConfig } from './PiInterface.js';

export class PiExecutorWrapper implements PiExecutorInterface {
  private executor: PiExecutorInterface | null = null;
  private enabled: boolean;

  constructor(config: PiConfig = {}) {
    this.enabled = config.enabled ?? true;

    if (!this.enabled) {
      console.log('[PiExecutorWrapper] Pi executor is disabled');
      return;
    }

    try {
      const { PiExecutor } = require('@nezha/nupi');
      this.executor = new PiExecutor({
        model: config.model || 'zai:glm-4.5-flash',
      });
      console.log('[PiExecutorWrapper] NuPI PiExecutor loaded');
    } catch (error) {
      console.warn('[PiExecutorWrapper] Failed to load NuPI PiExecutor:', error);
      this.enabled = false;
    }
  }

  async execute(task: string): Promise<PiTaskResult> {
    if (!this.enabled || !this.executor) {
      return {
        success: false,
        output: '',
        message: 'Pi executor not available',
      };
    }

    console.log(`[PiExecutorWrapper] Executing task with Pi: ${task.substring(0, 50)}...`);
    return await this.executor.execute(task, 600000);
  }

  async executeWithSystemPrompt(systemPrompt: string, task: string): Promise<PiTaskResult> {
    const combined = `${systemPrompt}\n\n## Task\n${task}`;
    return await this.execute(combined);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
