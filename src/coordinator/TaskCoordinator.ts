import { TaskRouter, ExecutorType } from "../router/TaskRouter.js";
import { PiExecutorWrapper } from "../executor/PiExecutorWrapper.js";
import { OpenCodeSessionManager } from "../services/OpenCodeSessionManager.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_COMPLETION_TIMEOUT_MS = 300_000;
const IDLE_THRESHOLD_MS = 60_000;

export interface TaskContext {
  id: string;
  title: string;
  description?: string;
  priority: number;
  complexity?: number;
  delegateTo?: string;
}

export interface CoordinatorConfig {
  opencodeUrl: string;
  opencodeAuth?: { username: string; password: string };
  useAuth?: boolean;
  usePi?: boolean;
  piModel?: string;
  sessionTitle?: string;
  pollIntervalMs?: number;
  completionTimeoutMs?: number;
}

export class TaskCoordinator {
  private router: TaskRouter;
  private config: CoordinatorConfig;
  private piExecutor: PiExecutorWrapper | null = null;
  private readonly pollInterval: number;
  private readonly completionTimeout: number;
  private sessionManager: OpenCodeSessionManager;

  constructor(config: CoordinatorConfig) {
    this.router = new TaskRouter();
    this.config = {
      useAuth: true,
      usePi: config.usePi ?? true,
      ...config,
    };
    this.pollInterval = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.completionTimeout =
      config.completionTimeoutMs ?? DEFAULT_COMPLETION_TIMEOUT_MS;

    this.sessionManager = OpenCodeSessionManager.create({
      opencodeUrl: config.opencodeUrl,
      username: config.opencodeAuth?.username,
      password: config.opencodeAuth?.password,
      useAuth: this.config.useAuth,
    });

    if (this.config.usePi) {
      this.piExecutor = new PiExecutorWrapper({ model: this.config.piModel });
    }
  }

  async execute(
    task: TaskContext,
  ): Promise<{ executor: ExecutorType; result: string }> {
    const routingResult = this.router.route(
      task.title,
      task.description,
      task.priority,
    );
    const executorType = routingResult.executor;

    if (executorType === "pi" && this.piExecutor) {
      console.log(`[TaskCoordinator] Executing task "${task.title}" on Pi...`);
      try {
        const piResult = await this.piExecutor.execute(task.title);
        return {
          executor: "pi",
          result: piResult.success
            ? piResult.output
            : `Failed: ${piResult.message}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[TaskCoordinator] Failed to execute on Pi:`, errorMsg);
        return { executor: "pi", result: `Failed: ${errorMsg}` };
      }
    }

    console.log(
      `[TaskCoordinator] Executing task "${task.title}" on OpenCode...`,
    );

    try {
      const result = await this.executeOnOpenCode(task);
      return { executor: "opencode", result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[TaskCoordinator] Failed to execute on OpenCode:`,
        errorMsg,
      );
      return { executor: "opencode", result: `Failed: ${errorMsg}` };
    }
  }

  private async executeOnOpenCode(task: TaskContext): Promise<string> {
    await this.sessionManager.getSessionId();

    const message = this.buildTaskMessage(task);

    await this.sessionManager.sendMessage({
      parts: [{ type: "text", text: message }],
    });

    console.log(
      `[TaskCoordinator] Task sent to OpenCode, waiting for completion...`,
    );

    const result = await this.waitForCompletion(this.completionTimeout);
    return result;
  }

  private async waitForCompletion(timeoutMs: number): Promise<string> {
    const startTime = Date.now();
    let lastActivityTime = Date.now();
    let hadActivity = false;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));

      try {
        const data = await this.sessionManager.getSessionStatus();
        if (!data) continue;

        const statusData = data as {
          status?: string;
          summary?: { additions?: number; deletions?: number; files?: number };
          time?: { updated?: number };
        };

        const additions = statusData.summary?.additions ?? 0;
        const deletions = statusData.summary?.deletions ?? 0;
        const files = statusData.summary?.files ?? 0;
        const hasActivity = additions > 0 || deletions > 0;
        const lastUpdate = statusData.time?.updated;

        if (hasActivity) {
          lastActivityTime = Date.now();
          hadActivity = true;
          console.log(
            `[TaskCoordinator] Processing... additions: ${additions}, files: ${files}`,
          );
        } else if (hadActivity && lastUpdate) {
          const idleTime = Date.now() - lastUpdate;

          if (idleTime > IDLE_THRESHOLD_MS) {
            if (
              !hadActivity ||
              (additions === 0 && deletions === 0 && files === 0)
            ) {
              console.log(
                `[TaskCoordinator] VERIFICATION FAILED: No actual changes made - possible fake completion`,
              );
              throw new Error(
                "Verification failed: No code changes detected. Task not actually completed.",
              );
            }
            console.log(
              `[TaskCoordinator] Session idle for ${idleTime / 1000}s after activity - completed`,
            );
            return `Task completed (additions: ${additions}, deletions: ${deletions}, files: ${files})`;
          }
          console.log(`[TaskCoordinator] Waiting... idle: ${idleTime / 1000}s`);
        } else if (!hadActivity) {
          console.log(`[TaskCoordinator] Waiting for session to start...`);
        }
      } catch (error) {
        console.log(`[TaskCoordinator] Poll error:`, error);
      }
    }

    return "Task timeout - still processing";
  }

  private buildTaskMessage(task: TaskContext): string {
    return `
## Task

**Title**: ${task.title}
**Description**: ${task.description || "(none)"}
**Priority**: ${task.priority}

## Execution Requirements

1. Analyze task autonomously
2. Create execution plan
3. Execute and complete
4. After completion, use these markers:
   - [LEARN] insight: <insight>
   - [ISSUE] title: <issue> type: <type> severity: <severity>
   - [TASK] title: <new task> priority: <priority>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."
`;
  }

  async getSessionId(): Promise<string | null> {
    try {
      return await this.sessionManager.getSessionId();
    } catch {
      return null;
    }
  }

  async isSessionAlive(): Promise<boolean> {
    const sessionId = this.sessionManager["sessionId"];
    if (!sessionId) return false;
    return this.sessionManager.validateSession(sessionId).catch(() => false);
  }

  async reuseSession(sessionId: string): Promise<void> {
    const isValid = await this.sessionManager
      .validateSession(sessionId)
      .catch(() => false);
    if (!isValid) {
      this.sessionManager.invalidateSession();
    }
  }

  setRouterConfig(config: Partial<TaskRouter["config"]>) {
    this.router.setConfig(config);
  }
}
