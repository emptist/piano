// Piano - OpenCode/Pi extension for Nezha
// Re-exports from nezha core
export { TaskRouter, TaskPlanner, type ExecutorType, type TaskRouterConfig, type PlannedTask, type SubTask, type TaskContext } from 'nezha';

// Piano-specific exports
export { TaskCoordinator } from './coordinator/TaskCoordinator.js';
export type { CoordinatorConfig } from './coordinator/TaskCoordinator.js';

export { ContinuousWorkEngine } from './engine/ContinuousWorkEngine.js';
export type { EngineConfig } from './engine/ContinuousWorkEngine.js';

export { PiExecutorWrapper } from './executor/PiExecutorWrapper.js';

export { OpenCodeSessionManager } from './services/OpenCodeSessionManager.js';
export { OpenCodeReminderService } from './services/OpenCodeReminderService.js';
