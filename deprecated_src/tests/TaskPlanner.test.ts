import { describe, it, expect } from 'vitest';
import { TaskPlanner } from '../planner/TaskPlanner.js';
import { TaskRouter } from '../router/TaskRouter.js';

describe('TaskPlanner', () => {
  const planner = new TaskPlanner();

  it('should create a simple plan for basic task', () => {
    const task = { id: '1', title: 'Check logs', priority: 5 };
    const plan = planner.plan(task);

    expect(plan.subtasks).toHaveLength(1);
    expect(plan.subtasks[0].title).toContain('Execute');
    expect(plan.estimatedDuration).toBe(15);
  });

  it('should decompose create task into analysis and implementation', () => {
    const task = { id: '2', title: 'Create user API', priority: 8 };
    const plan = planner.plan(task);

    expect(plan.subtasks.length).toBeGreaterThanOrEqual(2);
    expect(plan.subtasks.some(st => st.title.includes('Analyze'))).toBe(true);
  });

  it('should add database subtask for database tasks', () => {
    const task = { id: '3', title: 'Create database migration', priority: 7 };
    const plan = planner.plan(task);

    expect(plan.subtasks.some(st => st.title.includes('Design'))).toBe(true);
  });

  it('should estimate duration based on subtask count', () => {
    const task = { id: '4', title: 'Implement complex feature with API and tests', priority: 9 };
    const plan = planner.plan(task);

    expect(plan.estimatedDuration).toBeGreaterThan(15);
  });

  it('should return true for parallelization when no dependencies', () => {
    const subtasks = [
      { title: 'Task A', description: 'desc', priority: 5 },
      { title: 'Task B', description: 'desc', priority: 5 },
    ];

    expect(planner.shouldParallelize(subtasks)).toBe(true);
  });

  it('should return false for parallelization when dependencies exist', () => {
    const subtasks = [
      { title: 'Task A', description: 'desc', priority: 5 },
      { title: 'Task B', description: 'desc', priority: 5, dependsOn: ['Task A'] },
    ];

    expect(planner.shouldParallelize(subtasks)).toBe(false);
  });

  describe('delegation', () => {
    it('should not delegate simple tasks for pi', () => {
      const task = { id: '1', title: 'Check logs', priority: 5 };
      const plan = planner.plan(task, 'pi');

      expect(plan.shouldDelegate).toBe(false);
      expect(plan.delegateTo).toBeUndefined();
    });

    it('should delegate complex tasks for pi', () => {
      const task = { id: '2', title: 'Refactor database architecture', priority: 8 };
      const plan = planner.plan(task, 'pi');

      expect(plan.shouldDelegate).toBe(true);
      expect(plan.delegateTo).toBe('opencode');
      expect(plan.complexity).toBeGreaterThanOrEqual(4);
    });

    it('should not delegate for opencode', () => {
      const task = { id: '3', title: 'Refactor database architecture', priority: 8 };
      const plan = planner.plan(task, 'opencode');

      expect(plan.shouldDelegate).toBe(false);
    });

    it('should set complexity based on task content', () => {
      const simpleTask = { id: '1', title: 'List files', priority: 5 };
      const complexTask = { id: '2', title: 'Security migration', priority: 8 };

      const simplePlan = planner.plan(simpleTask, 'pi');
      const complexPlan = planner.plan(complexTask, 'pi');

      expect(complexPlan.complexity!).toBeGreaterThan(simplePlan.complexity!);
    });
  });

  describe('full delegation flow', () => {
    it('should route to pi then delegate complex to opencode', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      const planner = new TaskPlanner();

      const result = router.route('Check logs and refactor database', 'Complex reminder task');
      expect(result.executor).toBe('pi');

      const plan = planner.plan(
        { id: '1', title: 'Check logs and refactor database', priority: 5 },
        'pi'
      );
      expect(plan.shouldDelegate).toBe(true);
      expect(plan.delegateTo).toBe('opencode');
    });

    it('should route to pi and not delegate simple tasks', () => {
      const router = new TaskRouter({ useOpenCode: true, usePi: true, selfCapability: 'pi' });
      const planner = new TaskPlanner();

      const result = router.route('Check logs', 'Simple task');
      expect(result.executor).toBe('pi');

      const plan = planner.plan({ id: '1', title: 'Check logs', priority: 5 }, 'pi');
      expect(plan.shouldDelegate).toBe(false);
    });
  });
});
