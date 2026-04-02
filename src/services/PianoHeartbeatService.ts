/**
 * PianoHeartbeatService - 子类继承 HeartbeatService
 *
 * 架构说明：
 * - 继承核心 HeartbeatService，添加 Piano 功能
 * - piano 是独立 repo，通过 npm link 使用本地 nezha
 */

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

// TODO: 等变成 npm 包后，取消注释
// export class PianoHeartbeatService extends HeartbeatService {
export class PianoHeartbeatService /* extends HeartbeatService */ {
  private readonly db: DatabaseClient;
  private readonly taskRouter: TaskRouter;
  private readonly taskPlanner: TaskPlanner;
  private readonly taskCoordinator: TaskCoordinator | null = null;
  private readonly piExecutor: PiExecutorWrapper | null = null;
  private readonly config: PianoHeartbeatConfig;

  constructor(db: DatabaseClient, config?: PianoHeartbeatConfig) {
    // TODO: super(db, config);
    this.db = db;
    this.config = config || {};

    const enablePi = config?.enablePi ?? false;

    this.taskRouter = new TaskRouter({
      useOpenCode: config?.useOpenCode ?? true,
      usePi: enablePi,
      complexityThreshold: 999,
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

  /**
   * Piano 特有的任务执行逻辑
   *
   * 需要在父类中重写 executeTask 或将其改为 protected
   * 然后在此子类中 override 执行 Piano 特有的路由逻辑
   *
   * 执行流程：
   * 1. 使用 taskRouter.route() 决定发给哪个执行器 (internal/opencode/pi)
   * 2. opencode → 使用 taskCoordinator.execute()
   * 3. pi → 使用 taskPlanner.plan() 评估复杂度 → piExecutor.execute()
   * 4. internal → 留给父类的默认逻辑
   */
  async executePianoTask(
    taskId: string,
    title: string,
    description?: string,
  ): Promise<void> {
    logger.info(`[PianoHeartbeat] Executing task: ${title}`);

    const executor = this.taskRouter.route(title, description);
    logger.info(`[TaskRouter] Routing "${title}" to: ${executor}`);

    let opencodeFailed = false;

    // OpenCode 执行路径
    if (executor === "opencode") {
      logger.info(
        `[TaskRouter] Task "${title}" routed to OpenCode - sending to OpenCode...`,
      );

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

    // Pi 执行路径
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

      // 获取系统状态和知识上下文
      const systemStatus = await this.getSystemStatus();
      const essentialKnowledge = await this.getEssentialKnowledge();
      const piPrompt = `## SYSTEM STATUS\n${systemStatus}\n\n## ESSENTIAL KNOWLEDGE\n${essentialKnowledge}\n\n## TASK\n${title}\n${description || ""}\n\nAfter completing, create subtasks in format: - task: <title>`;

      try {
        const result = await this.piExecutor.execute(piPrompt);
        logger.info(
          `[PiExecutor] Result: ${result.message.substring(0, 100)}...`,
        );

        const complexity = planned.complexity ?? 0;

        await this.db.query(
          `UPDATE ${DATABASE_TABLES.TASKS} SET status = $1, result = $2, completed_at = NOW(), retry_count = 0, complexity = $3 WHERE id = $4`,
          [
            TASK_STATUS.COMPLETED,
            JSON.stringify({ message: result.message, output: result.output }),
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

    // Internal AI 执行路径（留给父类）
    if (executor !== "opencode" || opencodeFailed) {
      logger.info(`[TaskRouter] Executing task "${title}" with internal AI...`);
      // 这里的逻辑留给父类 HeartbeatService 处理
      // 父类应该有一个 executeInternalTask() 方法
      await this.executeInternalTask(taskId, title, description);
    }
  }

  /**
   * 内部 AI 执行 - 由父类提供
   * TODO: 等父类重构后确定具体调用方式
   */
  private async executeInternalTask(
    taskId: string,
    title: string,
    description?: string,
  ): Promise<void> {
    // TODO: 调用父类的内部 AI 执行逻辑
    // 或者让父类暴露一个 protected 方法
    logger.info(
      `[PianoHeartbeat] Delegating to internal AI for task: ${title}`,
    );
  }

  /**
   * 获取系统状态
   * TODO: 移到父类或提取为独立工具类
   */
  private async getSystemStatus(): Promise<string> {
    // TODO: 实现
    return "System status placeholder";
  }

  /**
   * 获取核心知识
   * TODO: 移到父类或提取为独立工具类
   */
  private async getEssentialKnowledge(): Promise<string> {
    // TODO: 实现
    return "Essential knowledge placeholder";
  }

  /**
   * 从 Pi 输出中提取并创建子任务
   * TODO: 移到父类或提取为独立工具类
   */
  private async extractAndCreateTasks(
    output: string,
    parentTitle: string,
    options: { complexity: number },
  ): Promise<void> {
    // TODO: 实现
    logger.info(`[PianoHeartbeat] Extract subtasks from: ${parentTitle}`);
  }
}
