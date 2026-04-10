import { AICapability } from "nezha";
import { AI_CAPABILITY_LEVELS } from "../shared/capability.js";

export type ExecutorType = "internal" | "opencode" | "pi" | "hybrid";

export interface TaskRouterConfig {
  useOpenCode: boolean;
  usePi: boolean;
  complexityThreshold: number;
  selfCapability: AICapability;
  delegateAll: boolean;
}

export class TaskRouter {
  private config: TaskRouterConfig;

  constructor(config: Partial<TaskRouterConfig> = {}) {
    this.config = {
      useOpenCode: config.useOpenCode ?? true,
      usePi: config.usePi ?? true,
      complexityThreshold: config.complexityThreshold ?? 50,
      selfCapability: config.selfCapability ?? "internal",
      delegateAll: config.delegateAll ?? false,
    };
  }

  shouldDelegate(complexity: number): boolean {
    const selfLevel = AI_CAPABILITY_LEVELS[this.config.selfCapability];
    const requiredLevel = complexity > 70 ? 3 : complexity > 40 ? 2 : 1;
    return requiredLevel > selfLevel;
  }

  getDelegationTarget(): AICapability | null {
    const selfLevel = AI_CAPABILITY_LEVELS[this.config.selfCapability];
    if (selfLevel < 3 && this.config.useOpenCode) {
      return "opencode";
    }
    return null;
  }

  route(
    taskTitle: string,
    taskDescription?: string,
    priority: number = 0,
    delegateTo?: AICapability,
  ): ExecutorType {
    if (delegateTo && delegateTo !== this.config.selfCapability) {
      return this.executorForCapability(delegateTo);
    }

    const taskText = `${taskTitle} ${taskDescription || ""}`.toLowerCase();

    const requiresLocalOperation =
      taskText.includes("edit file") ||
      taskText.includes("modify code") ||
      taskText.includes("run bash") ||
      taskText.includes("read file") ||
      taskText.includes("write file") ||
      taskText.includes("database") ||
      taskText.includes("sql") ||
      taskText.includes("execute command");

    const isPiTask =
      taskText.includes("remind") ||
      taskText.includes("check") ||
      taskText.includes("plan") ||
      taskText.includes("simple") ||
      taskText.includes("review") ||
      taskText.includes("list");

    if (priority >= 50 && this.config.useOpenCode) {
      return "opencode";
    }

    if (isPiTask && this.config.usePi) {
      return "pi";
    }

    if (requiresLocalOperation && this.config.usePi) {
      return "pi";
    }

    if (this.config.useOpenCode) {
      return "opencode";
    }

    return "internal";
  }

  private executorForCapability(capability: AICapability): ExecutorType {
    switch (capability) {
      case "opencode":
        return "opencode";
      case "pi":
        return "pi";
      case "internal":
      case "human":
      default:
        return "internal";
    }
  }

  setConfig(config: Partial<TaskRouterConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TaskRouterConfig {
    return { ...this.config };
  }
}
