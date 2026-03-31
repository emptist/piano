import { TaskRouter, type ExecutorType } from '../router/TaskRouter.js';
import type { TaskContext } from '../planner/TaskPlanner.js';
import { PiExecutorWrapper } from '../executor/PiExecutorWrapper.js';

export interface CoordinatorConfig {
  opencodeUrl: string;
  opencodeAuth?: { username: string; password: string };
  useAuth?: boolean;
  usePi?: boolean;
  piModel?: string;
}

export class TaskCoordinator {
  private router: TaskRouter;
  private config: CoordinatorConfig;
  private sessionId: string | null = null;
  private piExecutor: PiExecutorWrapper | null = null;

  constructor(config: CoordinatorConfig) {
    this.router = new TaskRouter();
    this.config = {
      useAuth: true,
      usePi: config.usePi ?? false,
      ...config,
    };

    if (this.config.usePi) {
      this.piExecutor = new PiExecutorWrapper({ model: this.config.piModel });
    }
  }

  async execute(task: TaskContext): Promise<{ executor: ExecutorType; result: string }> {
    const executorType = this.router.route(task.title, task.description, task.priority);

    if (executorType === 'pi' && this.piExecutor) {
      console.log(`[TaskCoordinator] Executing task "${task.title}" on Pi...`);
      try {
        const piResult = await this.piExecutor.execute(task.title);
        return {
          executor: 'pi',
          result: piResult.success ? piResult.output : `Failed: ${piResult.message}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[TaskCoordinator] Failed to execute on Pi:`, errorMsg);
        return { executor: 'pi', result: `Failed: ${errorMsg}` };
      }
    }

    console.log(`[TaskCoordinator] Executing task "${task.title}" on OpenCode...`);

    try {
      const result = await this.executeOnOpenCode(task);
      return { executor: 'opencode', result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[TaskCoordinator] Failed to execute on OpenCode:`, errorMsg);
      return { executor: 'opencode', result: `Failed: ${errorMsg}` };
    }
  }

  private async executeOnOpenCode(task: TaskContext): Promise<string> {
    if (!this.sessionId || !(await this.isSessionAlive())) {
      if (this.sessionId) {
        console.log(`[TaskCoordinator] Session ${this.sessionId} dead, recreating...`);
      }
      await this.createSession();
    }

    if (!this.sessionId) {
      throw new Error('Failed to create OpenCode session');
    }

    const message = this.buildTaskMessage(task);

    const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenCode message failed: ${response.status}`);
    }

    console.log(`[TaskCoordinator] Task sent to OpenCode, waiting for completion...`);

    const result = await this.waitForCompletion(300000);
    return result;
  }

  private async waitForCompletion(timeoutMs: number = 300000): Promise<string> {
    const pollInterval = 5000;
    const startTime = Date.now();
    let lastActivityTime = Date.now();
    let hadActivity = false;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}`, {
          headers: this.getAuthHeader(),
        });

        if (!response.ok) continue;

        const data = (await response.json()) as {
          status?: string;
          result?: string;
          summary?: { additions?: number; deletions?: number; files?: number };
          time?: { updated?: number };
        };

        const additions = data.summary?.additions ?? 0;
        const deletions = data.summary?.deletions ?? 0;
        const files = data.summary?.files ?? 0;
        const hasActivity = additions > 0 || deletions > 0;
        const lastUpdate = data.time?.updated;

        if (hasActivity) {
          lastActivityTime = Date.now();
          hadActivity = true;
          console.log(`[TaskCoordinator] Processing... additions: ${additions}, files: ${files}`);
        } else if (hadActivity && lastUpdate) {
          const now = Date.now();
          const idleTime = now - lastActivityTime;

          if (idleTime > 60000) {
            if (!hadActivity || (additions === 0 && deletions === 0 && files === 0)) {
              console.log(
                `[TaskCoordinator] VERIFICATION FAILED: No actual changes made - possible fake completion`
              );
              throw new Error(
                'Verification failed: No code changes detected. Task not actually completed.'
              );
            }
            console.log(
              `[TaskCoordinator] Session idle for ${idleTime / 1000}s after activity - completed`
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

    return 'Task timeout - still processing';
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${this.config.opencodeUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({ title: 'piano-coordinator-session' }),
    });

    if (response.ok) {
      const data = (await response.json()) as { id: string };
      this.sessionId = data.id.startsWith('ses_') ? data.id : `ses_${data.id}`;
      console.log(`[TaskCoordinator] Created session: ${this.sessionId}`);
    }
  }

  private buildTaskMessage(task: TaskContext): string {
    return `
## 任务

**标题**: ${task.title}
**描述**: ${task.description || '(无)'}
**优先级**: ${task.priority}

## 执行要求

1. 自主分析任务
2. 制定执行计划
3. 执行并完成
4. 完成后使用以下标记：
   - [LEARN] insight: <学到的>
   - [ISSUE] title: <问题> type: <类型> severity: <程度>
   - [TASK] title: <新任务> priority: <优先级>

Save via: node dist/cli/index.js areflect "[LEARN] insight: ..."
`;
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.config.useAuth) return {};

    const username =
      this.config.opencodeAuth?.username || process.env.OPENCODE_SERVER_USERNAME || 'opencode';
    const password =
      this.config.opencodeAuth?.password || process.env.OPENCODE_SERVER_PASSWORD || 'nezha-secret';

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async isSessionAlive(): Promise<boolean> {
    if (!this.sessionId) return false;

    try {
      const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}`, {
        headers: this.getAuthHeader(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async reuseSession(sessionId: string) {
    this.sessionId = sessionId;
    if (!(await this.isSessionAlive())) {
      this.sessionId = null;
      await this.createSession();
    }
  }

  setRouterConfig(config: Partial<TaskRouter['config']>) {
    this.router.setConfig(config);
  }
}
