import { AICapability } from "nezha";
import { AI_CAPABILITY_LEVELS } from "../shared/capability.js";

export type ExecutorType = "internal" | "opencode" | "pi" | "hybrid";

export type OpenCodeAgentType = "explore" | "plan" | "build" | "general";

export interface TaskRouterConfig {
  useOpenCode: boolean;
  usePi: boolean;
  complexityThreshold: number;
  selfCapability: AICapability;
  delegateAll: boolean;
}

export interface RoutingResult {
  executor: ExecutorType;
  opencodeAgent?: OpenCodeAgentType;
  reason: string;
}

const AGENT_TYPE_PATTERNS: Record<OpenCodeAgentType, string[]> = {
  explore: ["explore", "search", "find", "investigate", "analyze code", "understand", "research", "find files", "grep", "read code"],
  plan: ["plan", "design", "architecture", "spec", "proposal", "estimate", "roadmap"],
  build: ["implement", "create", "build", "refactor", "fix", "debug", "test", "write code"],
  general: ["help", "question", "explain", "review", "summarize"],
};

function inferAgentType(taskText: string): OpenCodeAgentType {
  const lower = taskText.toLowerCase();
  
  for (const [agentType, patterns] of Object.entries(AGENT_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (lower.includes(pattern)) {
        return agentType as OpenCodeAgentType;
      }
    }
  }
  return "general";
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
  ): RoutingResult {
    const taskText = `${taskTitle} ${taskDescription || ""}`.toLowerCase();
    
    if (delegateTo && delegateTo !== this.config.selfCapability) {
      const executor = this.executorForCapability(delegateTo);
      const agentType = executor === "opencode" ? inferAgentType(taskText) : undefined;
      return { executor, opencodeAgent: agentType, reason: `Explicit delegation to ${delegateTo}` };
    }

    console.log(`[TaskRouter] Routing: "${taskTitle.substring(0, 30)}..." priority=${priority}`);

    if (priority >= 50 && this.config.useOpenCode) {
      const agentType = inferAgentType(taskText);
      console.log(`[TaskRouter] High priority (${priority}) → routing to opencode (${agentType})`);
      return { executor: "opencode", opencodeAgent: agentType, reason: `High priority task` };
    }

    const isSimplePiTask =
      taskText.includes("remind") ||
      taskText.includes("check") ||
      taskText.includes("plan") ||
      taskText.includes("simple") ||
      taskText.includes("review") ||
      taskText.includes("list");

    if (isSimplePiTask && this.config.usePi) {
      console.log(`[TaskRouter] Simple task → routing to pi`);
      return { executor: "pi", reason: `Simple task suitable for Pi` };
    }

    const requiresOpenCode =
      taskText.includes("edit file") ||
      taskText.includes("modify code") ||
      taskText.includes("run bash") ||
      taskText.includes("database") ||
      taskText.includes("implement") ||
      taskText.includes("create") ||
      taskText.includes("build") ||
      taskText.includes("refactor");

    if (requiresOpenCode && this.config.useOpenCode) {
      const agentType = inferAgentType(taskText);
      console.log(`[TaskRouter] Requires OpenCode → routing to opencode (${agentType})`);
      return { executor: "opencode", opencodeAgent: agentType, reason: `Requires code manipulation` };
    }

    if (this.config.useOpenCode) {
      const agentType = inferAgentType(taskText);
      console.log(`[TaskRouter] Default → routing to opencode (${agentType})`);
      return { executor: "opencode", opencodeAgent: agentType, reason: `Default routing` };
    }

    if (this.config.usePi) {
      console.log(`[TaskRouter] Fallback → routing to pi`);
      return { executor: "pi", reason: `Fallback to Pi` };
    }

    console.log(`[TaskRouter] No executor available → internal`);
    return { executor: "internal", reason: `No external executor available` };
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
