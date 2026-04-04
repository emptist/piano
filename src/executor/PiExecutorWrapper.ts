import { PiExecutor, type PiTaskResult } from "@nezha/nupi";

export interface PiExecutorConfig {
  model?: string;
  timeoutMs?: number;
}

export class PiExecutorWrapper {
  private executor: PiExecutor;

  constructor(config: PiExecutorConfig = {}) {
    this.executor = new PiExecutor({
      model: config.model || "zai:glm-4.5-flash",
    });
  }

  async execute(task: string): Promise<PiTaskResult> {
    console.log(
      `[PiExecutorWrapper] Executing task with Pi: ${task.substring(0, 50)}...`,
    );
    return await this.executor.execute(task, 600000);
  }

  async executeWithSystemPrompt(
    systemPrompt: string,
    task: string,
  ): Promise<PiTaskResult> {
    const combined = `${systemPrompt}\n\n## Task\n${task}`;
    return await this.execute(combined);
  }
}
