import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "nezha";

const execAsync = promisify(exec);

export interface PiTaskResult {
  success: boolean;
  output: string;
  message: string;
  durationMs: number;
  toolsCreated?: string[];
}

export interface PiConfig {
  piPath?: string;
  model?: string;
  env?: Record<string, string>;
}

export class PiExecutor {
  private readonly piPath: string;
  private readonly defaultModel: string;
  private readonly env: Record<string, string>;

  constructor(config: PiConfig = {}) {
    this.piPath = config.piPath || "pi";
    this.defaultModel = config.model || "zai:glm-4.5-flash";
    this.env = config.env || {};
  }

  async execute(
    taskDescription: string,
    timeoutMs: number = 600000,
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      const escapedDescription = taskDescription.replace(/"/g, '\\"');

      const command = `${this.piPath} execute --model ${this.defaultModel} --print "${escapedDescription}"`;

      logger.info(`[PiExecutor] Executing task (model: ${this.defaultModel})`);

      const { stdout, stderr } = await Promise.race([
        execAsync(command, {
          timeout: timeoutMs,
          env: { ...process.env, ...this.env },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Pi execution timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes("error") &&
        !output.toLowerCase().includes("failed");

      return {
        success,
        output,
        message: success
          ? "Task completed successfully"
          : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(`[PiExecutor] Failed: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  async executeJson(
    taskDescription: string,
    timeoutMs: number = 600000,
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      const escapedDescription = taskDescription.replace(/"/g, '\\"');

      const command = `${this.piPath} execute --model ${this.defaultModel} --mode json "${escapedDescription}"`;

      logger.info(
        `[PiExecutor] Executing JSON task (model: ${this.defaultModel})`,
      );

      const { stdout, stderr } = await Promise.race([
        execAsync(command, {
          timeout: timeoutMs,
          env: { ...process.env, ...this.env },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Pi execution timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success = !output.toLowerCase().includes("error");

      const toolsCreated = this.extractToolsCreated(output);

      return {
        success,
        output,
        message: success ? "Task completed" : "Task failed",
        durationMs,
        toolsCreated,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  private extractToolsCreated(output: string): string[] {
    const tools: string[] = [];
    const toolPattern = /(?:created|registered|new tool):?\s*(\w+)/gi;
    let match;
    while ((match = toolPattern.exec(output)) !== null) {
      if (match[1]) tools.push(match[1]);
    }
    return tools;
  }

  async executeWithPrompt(
    systemPrompt: string,
    task: string,
    timeoutMs: number = 600000,
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      const escapedSystemPrompt = systemPrompt.replace(/"/g, '\\"');
      const escapedTask = task.replace(/"/g, '\\"');

      const command = `${this.piPath} --system-prompt "${escapedSystemPrompt}" --print "${escapedTask}"`;

      logger.info(
        `[PiExecutor] Executing with system prompt (model: ${this.defaultModel})`,
      );

      const { stdout, stderr } = await Promise.race([
        execAsync(command, {
          timeout: timeoutMs,
          env: { ...process.env, ...this.env },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Pi execution timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes("error") &&
        !output.toLowerCase().includes("failed");

      return {
        success,
        output,
        message: success
          ? "Task completed successfully with system prompt"
          : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(`[PiExecutor] Failed with system prompt: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }
}

let piExecutorInstance: PiExecutor | null = null;

export function getPiExecutor(config?: PiConfig): PiExecutor {
  if (!piExecutorInstance) {
    piExecutorInstance = new PiExecutor(config);
  }
  return piExecutorInstance;
}
