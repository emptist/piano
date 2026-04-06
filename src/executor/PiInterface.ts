export interface PiTaskResult {
  success: boolean;
  output: string;
  message?: string;
}

export interface PiExecutorInterface {
  execute(task: string, timeoutMs?: number): Promise<PiTaskResult>;
  executeWithSystemPrompt(systemPrompt: string, task: string): Promise<PiTaskResult>;
}

export interface PiConfig {
  model?: string;
  enabled?: boolean;
}
