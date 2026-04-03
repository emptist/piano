# Code Review: Piano

## Summary
Piano is a task routing and coordination subsystem for Nezha AI. It extends the core HeartbeatService with task routing, planning, and execution capabilities. The codebase is well-structured and typechecks successfully.

## Positives
- Clean architecture with clear separation: `TaskRouter`, `TaskCoordinator`, `TaskPlanner`, `ContinuousWorkEngine`
- TypeScript types are well-defined
- Proper error handling in most places
- Good logging throughout
- Session caching and reuse in `OpenCodeSessionManager`
- Verification logic to detect fake completions (`waitForCompletion` in TaskCoordinator:143-150)

## Issues to Address

### 1. PianoHeartbeatService not extending HeartbeatService
**File:** `src/services/PianoHeartbeatService.ts:28`

Currently commented out - it's just a stub class that doesn't actually extend the parent. TODO comments indicate work is pending.

### 2. Duplicate AI capability levels
**Files:** `src/router/TaskRouter.ts:5-10` vs `src/planner/TaskPlanner.ts:121-126,131-137`

`AI_CAPABILITY_LEVELS` is defined twice in different files. Should be extracted to a shared module.

### 3. Hardcoded session title
**File:** `src/coordinator/TaskCoordinator.ts:175`

`title: 'piano-coordinator-session'` is hardcoded - should be configurable.

### 4. No graceful shutdown in ContinuousWorkEngine
**File:** `src/engine/ContinuousWorkEngine.ts:35-38`

`stop()` doesn't wait for in-flight tasks to complete.

### 5. Missing exports
`PianoHeartbeatService`, `PiExecutor`, `OpenCodeSessionManager` are not exported from `src/index.ts`.

### 6. Unused imports
In `src/planner/TaskPlanner.ts:1` imports `"nezha"` but uses it for type only.

### 7. Magic numbers
Polling intervals (5000ms), timeout (300000ms), heartbeat intervals (12) could be configurable.

## Minor
- `src/tests/TaskPlanner.test.ts` and `TaskRouter.test.ts` exist but haven't been run
- Deprecated folder contains old code but isn't cleaned up

## Verdict
Solid foundation with good architecture. Main work remaining is enabling the HeartbeatService extension and completing the TODO items in PianoHeartbeatService.