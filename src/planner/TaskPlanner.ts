import type { AICapability } from '../types.js';

// TaskContext defined in core to avoid dependency on coordinator
export interface TaskContext {
  id: string;
  title: string;
  description?: string;
  priority: number;
  complexity?: number;
  delegateTo?: string;
}

export interface PlannedTask extends TaskContext {
  subtasks: SubTask[];
  estimatedDuration: number;
  shouldDelegate?: boolean;
  delegateTo?: AICapability;
}

export interface SubTask {
  title: string;
  description: string;
  priority: number;
  dependsOn?: string[];
  complexity?: number;
}

export class TaskPlanner {
  plan(task: TaskContext, selfCapability: AICapability = 'pi'): PlannedTask {
    const subtasks = this.decompose(task);
    const estimatedDuration = this.estimateDuration(subtasks);
    const complexity = this.estimateComplexity(task);
    const shouldDelegate = this.needsDelegation(complexity, selfCapability);

    return {
      ...task,
      subtasks,
      estimatedDuration,
      complexity,
      shouldDelegate,
      delegateTo: shouldDelegate ? this.getDelegationTarget(selfCapability) : undefined,
    };
  }

  private decompose(task: TaskContext): SubTask[] {
    const title = task.title.toLowerCase();
    const subtasks: SubTask[] = [];

    if (title.includes('create') || title.includes('implement')) {
      subtasks.push({
        title: `分析: ${task.title}`,
        description: '分析需求和技术方案',
        priority: task.priority,
        complexity: 3,
      });
    }

    if (title.includes('api') || title.includes('database')) {
      subtasks.push({
        title: `设计: ${task.title}`,
        description: '设计接口和数据模型',
        priority: task.priority,
        complexity: 4,
        dependsOn: ['analysis'],
      });
    }

    if (title.includes('test')) {
      subtasks.push({
        title: `实现: ${task.title}`,
        description: '编写测试用例',
        priority: task.priority,
        complexity: 2,
      });
    }

    if (subtasks.length === 0) {
      subtasks.push({
        title: `执行: ${task.title}`,
        description: task.description || '执行任务',
        priority: task.priority,
        complexity: 2,
      });
    }

    return subtasks;
  }

  private estimateComplexity(task: TaskContext): number {
    let score = 1;
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    const complexKeywords = [
      'refactor',
      'debug',
      'security',
      'migration',
      'architecture',
      'design system',
      'implement',
      'create',
      'build',
      'api',
      'database',
    ];
    const mediumKeywords = ['test', 'integration', 'performance', 'optimize', 'fix'];

    for (const kw of complexKeywords) {
      if (text.includes(kw)) score += 1;
    }
    for (const kw of mediumKeywords) {
      if (text.includes(kw)) score += 0.5;
    }

    return Math.min(5, Math.max(1, Math.floor(score)));
  }

  private needsDelegation(complexity: number, selfCapability: AICapability): boolean {
    const levels: Record<AICapability, number> = { pi: 1, internal: 2, opencode: 3, human: 4 };
    const requiredLevel = complexity >= 5 ? 3 : complexity >= 3 ? 2 : 1;
    return requiredLevel > levels[selfCapability];
  }

  private getDelegationTarget(selfCapability: AICapability): AICapability {
    const levels: Record<AICapability, number> = { pi: 1, internal: 2, opencode: 3, human: 4 };
    if (levels[selfCapability] < 3) {
      return 'opencode';
    }
    return 'human';
  }

  private estimateDuration(subtasks: SubTask[]): number {
    return subtasks.length * 15;
  }

  shouldParallelize(subtasks: SubTask[]): boolean {
    return subtasks.every(st => !st.dependsOn || st.dependsOn.length === 0);
  }
}
