import type { TaskContext } from "../coordinator/TaskCoordinator.js";
import type { AICapability } from "nezha";
import { needsDelegation, getDelegationTarget } from "../shared/capability.js";

export interface PlannedTask extends TaskContext {
  subtasks: SubTask[];
  estimatedDuration: number;
  shouldDelegate?: boolean;
  delegateTo?: AICapability;
}

export interface SubTask {
  id: string;
  title: string;
  description: string;
  priority: number;
  dependsOn?: string[];
  complexity?: number;
}

export class TaskPlanner {
  plan(task: TaskContext, selfCapability: AICapability = "pi"): PlannedTask {
    const subtasks = this.decompose(task);
    const estimatedDuration = this.estimateDuration(subtasks);
    const complexity = this.estimateComplexity(task);
    const shouldDelegate = needsDelegation(complexity, selfCapability);

    return {
      ...task,
      subtasks,
      estimatedDuration,
      complexity,
      shouldDelegate,
      delegateTo: shouldDelegate
        ? getDelegationTarget(selfCapability)
        : undefined,
    };
  }

  private decompose(task: TaskContext): SubTask[] {
    const title = task.title.toLowerCase();
    const subtasks: SubTask[] = [];

    if (title.includes("create") || title.includes("implement")) {
      subtasks.push({
        id: "analysis",
        title: `Analyze: ${task.title}`,
        description: "Analyze requirements and technical approach",
        priority: task.priority,
        complexity: 3,
      });
    }

    if (title.includes("api") || title.includes("database")) {
      subtasks.push({
        id: "design",
        title: `Design: ${task.title}`,
        description: "Design interfaces and data models",
        priority: task.priority,
        complexity: 4,
        dependsOn: ["analysis"],
      });
    }

    if (title.includes("test")) {
      subtasks.push({
        id: "implement",
        title: `Implement: ${task.title}`,
        description: "Write test cases",
        priority: task.priority,
        complexity: 2,
      });
    }

    if (subtasks.length === 0) {
      subtasks.push({
        id: "execute",
        title: `Execute: ${task.title}`,
        description: task.description || "Execute the task",
        priority: task.priority,
        complexity: 2,
      });
    }

    return subtasks;
  }

  private estimateComplexity(task: TaskContext): number {
    let score = 1;
    const text = `${task.title} ${task.description || ""}`.toLowerCase();

    const complexKeywords = [
      "refactor",
      "debug",
      "security",
      "migration",
      "architecture",
      "design system",
      "implement",
      "create",
      "build",
      "api",
      "database",
    ];
    const mediumKeywords = [
      "test",
      "integration",
      "performance",
      "optimize",
      "fix",
    ];

    for (const kw of complexKeywords) {
      if (text.includes(kw)) score += 1;
    }
    for (const kw of mediumKeywords) {
      if (text.includes(kw)) score += 0.5;
    }

    return Math.min(5, Math.max(1, Math.floor(score)));
  }

  private estimateDuration(subtasks: SubTask[]): number {
    return subtasks.length * 15;
  }

  shouldParallelize(subtasks: SubTask[]): boolean {
    return subtasks.every((st) => !st.dependsOn || st.dependsOn.length === 0);
  }
}
