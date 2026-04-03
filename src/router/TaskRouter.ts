import { AICapability } from "nezha";
import { AI_CAPABILITY_LEVELS } from "../shared/capability.js";

export type ExecutorType = "internal" | "opencode" | "pi" | "hybrid";

export interface TaskRouterConfig {
  useOpenCode: boolean;
  usePi: boolean;
  complexityThreshold: number;
  selfCapability: AICapability;
}

export class TaskRouter {
  private config: TaskRouterConfig;

  constructor(config: Partial<TaskRouterConfig> = {}) {
    this.config = {
      useOpenCode: config.useOpenCode ?? true,
      usePi: config.usePi ?? false,
      complexityThreshold: config.complexityThreshold ?? 50,
      selfCapability: config.selfCapability ?? "internal",
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

    if (priority >= 50 && this.config.useOpenCode) {
      return "opencode";
    }

    const text = `${taskTitle} ${taskDescription || ""}`.toLowerCase();
    const isPiTask =
      text.includes("remind") ||
      text.includes("check") ||
      text.includes("plan") ||
      text.includes("arrange") ||
      text.includes("create task") ||
      text.includes("分解");

    if (isPiTask && this.config.usePi) {
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
