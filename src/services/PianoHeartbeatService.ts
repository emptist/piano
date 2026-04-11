import { HeartbeatService, type HeartbeatConfig } from "nezha";
import type { DatabaseClient } from "nezha";
import { Config } from "nezha";
import { logger } from "nezha";
import { TASK_STATUS, DATABASE_TABLES } from "nezha";
import { TaskRouter } from "../router/TaskRouter.js";
import { TaskCoordinator } from "../coordinator/TaskCoordinator.js";
import { TaskPlanner } from "../planner/TaskPlanner.js";
import { PiExecutorWrapper } from "../executor/PiExecutorWrapper.js";

export interface PianoHeartbeatConfig extends HeartbeatConfig {
  opencodeUrl?: string;
  opencodeAuth?: { username: string; password: string };
  useOpenCode?: boolean;
  enablePi?: boolean;
}

export class PianoHeartbeatService extends HeartbeatService {
  private readonly taskRouter: TaskRouter;
  private readonly taskPlanner: TaskPlanner;
  private readonly taskCoordinator: TaskCoordinator | null = null;
  private readonly piExecutor: PiExecutorWrapper | null = null;
  private readonly pianoConfig: PianoHeartbeatConfig;

  constructor(db: DatabaseClient, config?: PianoHeartbeatConfig) {
    super(db, config);
    this.pianoConfig = config || {};

    const enablePi = config?.enablePi ?? false;

    this.taskRouter = new TaskRouter({
      useOpenCode: config?.useOpenCode ?? true,
      usePi: enablePi,
      complexityThreshold: 50,
      selfCapability: "pi",
    });

    this.taskPlanner = new TaskPlanner();

    const opencodeUrl =
      config?.opencodeUrl ||
      Config.getInstance().getTransportConfig().opencodeApiUrl;
    if (opencodeUrl) {
      this.taskCoordinator = new TaskCoordinator({
        opencodeUrl,
        opencodeAuth: config?.opencodeAuth,
        usePi: enablePi,
      });
    }

    if (enablePi) {
      this.piExecutor = new PiExecutorWrapper();
    }
  }

  protected override async executeTask(
    taskId: string,
    title: string,
    description?: string,
    taskType?: string,
    retryCount: number = 0,
    maxRetries: number = 3,
  ): Promise<void> {
    logger.info(`[PianoHeartbeat] Routing task: ${title}`);

    const routingResult = this.taskRouter.route(title, description);
    const executor = routingResult.executor;
    logger.info(
      `[TaskRouter] Routing "${title}" to: ${executor} (${routingResult.reason})`,
    );

    let opencodeFailed = false;

    if (executor === "opencode") {
      logger.info(`[TaskRouter] Task "${title}" routed to OpenCode`);

      if (this.taskCoordinator) {
        try {
          const result = await this.taskCoordinator.execute({
            id: taskId,
            title,
            description: description || "",
            priority: 5,
          });
          logger.info(
            `[TaskCoordinator] Result from OpenCode: ${result.result.substring(0, 100)}...`,
          );

          await this.db.query(
            `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0 WHERE id = $3`,
            [
              TASK_STATUS.COMPLETED,
              JSON.stringify({ message: result.result }),
              taskId,
            ],
          );
          logger.info(`[TaskRouter] Task "${title}" completed via OpenCode`);
          return;
        } catch (error) {
          logger.error(`[TaskCoordinator] Failed:`, error);
          logger.info(
            `[TaskRouter] Falling back to internal AI for task "${title}"...`,
          );
          opencodeFailed = true;
        }
      } else {
        opencodeFailed = true;
      }
    }

    if (executor === "pi" && this.piExecutor) {
      logger.info(
        `[TaskRouter] Task "${title}" routed to Pi - checking delegation...`,
      );

      const planned = this.taskPlanner.plan({
        id: taskId,
        title,
        description,
        priority: 5,
      });

      if (planned.shouldDelegate && planned.delegateTo) {
        logger.info(
          `[TaskPlanner] Task too complex for Pi, delegating to ${planned.delegateTo}`,
        );
        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET delegate_to = $1, complexity = $2 WHERE id = $3`,
          [planned.delegateTo, planned.complexity, taskId],
        );
        return;
      }

      const systemStatus = await this.getSystemStatus();
      const essentialKnowledge = await this.getEssentialKnowledge();
      const piPrompt = `## SYSTEM STATUS\n${systemStatus}\n\n## ESSENTIAL KNOWLEDGE\n${essentialKnowledge}\n\n## TASK\n${title}\n${description || ""}\n\nAfter completing, create subtasks in format: - task: <title>`;

      try {
        const result = await this.piExecutor.execute(piPrompt);
        const resultMessage = result.message ?? result.output ?? "";
        logger.info(
          `[PiExecutor] Result: ${resultMessage.substring(0, 100)}...`,
        );

        const complexity = planned.complexity ?? 0;

        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, complexity = $3 WHERE id = $4`,
          [
            TASK_STATUS.COMPLETED,
            JSON.stringify({ message: resultMessage, output: result.output }),
            complexity,
            taskId,
          ],
        );

        await this.extractAndCreateTasks(result.output, title, {
          complexity,
        });
        logger.info(`[TaskRouter] Task "${title}" completed via Pi`);
        return;
      } catch (error) {
        logger.error(`[PiExecutor] Failed:`, error);
        logger.info(
          `[TaskRouter] Falling back to internal AI for task "${title}"...`,
        );
      }
    }

    if (executor !== "opencode" || opencodeFailed) {
      logger.info(`[TaskRouter] Executing task "${title}" with internal AI...`);
      await this.executeInternalAI(
        taskId,
        title,
        description,
        retryCount,
        maxRetries,
      );
    }
  }

  protected override async getSystemStatus(): Promise<string> {
    try {
      const tasksResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`,
      );
      const runningResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'RUNNING'`,
      );
      const failedResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`,
      );

      const pending = tasksResult.rows[0]?.count || "0";
      const running = runningResult.rows[0]?.count || "0";
      const failed = failedResult.rows[0]?.count || "0";

      return `Pending: ${pending}, Running: ${running}, Failed (24h): ${failed}`;
    } catch {
      return "System status unavailable";
    }
  }

  protected override async getEssentialKnowledge(): Promise<string> {
    try {
      const result = await this.db.query<{ content: string }>(
        `SELECT content FROM agent_memories
         WHERE agent_id = 'system' AND content_type = 'essential'
         ORDER BY importance DESC LIMIT 5`,
      );
      return result.rows.map((r) => r.content).join("\n\n");
    } catch {
      return "(No essential knowledge available)";
    }
  }

  private async extractAndCreateTasks(
    output: string,
    parentTitle: string,
    options: { complexity: number },
  ): Promise<void> {
    const taskPattern = /(?:^|\n)\s*[-*]\s*(?:task|TODO):\s*(.+?)(?:\n|$)/gi;
    const tasks: Array<{ title: string; description: string }> = [];
    let match;

    while ((match = taskPattern.exec(output)) !== null) {
      if (match[1]) {
        tasks.push({
          title: match[1].trim(),
          description: `Subtask extracted from: ${parentTitle}`,
        });
      }
    }

    if (tasks.length === 0) return;

    for (const task of tasks) {
      try {
        await this.db.query(
          `INSERT INTO tasks (title, description, priority, status) VALUES ($1, $2, $3, $4)`,
          [
            task.title,
            task.description,
            options.complexity >= 4 ? 6 : 3,
            "PENDING",
          ],
        );
        logger.info(`[PianoHeartbeat] Created subtask: ${task.title}`);
      } catch (error) {
        logger.warn(
          `[PianoHeartbeat] Failed to create subtask: ${task.title}`,
          error,
        );
      }
    }
  }
}
