# 🎹 Piano Project — Comprehensive Code Review

**Date:** 2026-04-03
**Reviewer:** AI Code Reviewer
**Scope:** Full codebase (src/, extensions/, services/, tests/, config)

---

## Project Overview

**Piano** (`@nezha/piano`) is a **task routing and coordination AI subsystem** for the Nezha AI platform. It implements a "three-in-one" architecture: **Pi (local LLM) + Nezha (core/DB) + OpenCode (heavy execution)**. The system routes incoming tasks to the appropriate executor based on complexity, keywords, and priority.

**Architecture flow:** `Task → TaskRouter.route() → { opencode | pi | internal }`

---

## ✅ Strengths

### 1. Clean Layered Architecture
The project has well-separated concerns:
- `src/router/TaskRouter.ts` — Routing logic (keyword + priority + complexity)
- `src/coordinator/TaskCoordinator.ts` — OpenCode session lifecycle & execution
- `src/planner/TaskPlanner.ts` — Task decomposition & complexity estimation
- `src/engine/ContinuousWorkEngine.ts` — Long-running DB-driven task loop
- `src/executor/PiExecutorWrapper.ts` / `src/services/PiExecutor.ts` — Local LLM execution
- `src/services/OpenCodeSessionManager.ts` — Singleton session manager with caching
- `src/services/OpenCodeReminderService.ts` — Proactive reminder broadcasting
- `src/services/PianoHeartbeatService.ts` — Orchestrator (intended HeartbeatService subclass)

### 2. Good TypeScript Practices
- `strict: true` with `noUncheckedIndexedAccess` in `tsconfig.json`
- Well-defined interfaces for all configs (`TaskRouterConfig`, `CoordinatorConfig`, `EngineConfig`, etc.)
- Proper barrel export in `src/index.ts`
- ES2022 + NodeNext module resolution

### 3. Session Management
`OpenCodeSessionManager.ts` has solid patterns:
- Singleton with lazy init (`getInstance`)
- File-based session caching to `.nezha/opencode-session.json`
- Session validation before reuse
- Guard against concurrent session creation (`creatingSession` promise deduplication)

### 4. Anti-Fake-Completion Verification
`TaskCoordinator.ts:143-162` includes smart idle-time detection after activity — it rejects sessions that show no actual code changes, which is a thoughtful defense mechanism.

### 5. Tests Exist
Both `TaskPlanner.test.ts` and `TaskRouter.test.ts` use vitest and cover routing, planning, delegation, and parallelization scenarios.

---

## 🔴 Critical Issues

### C1. `PianoHeartbeatService` Is a Stub — Inheritance Disabled
**File:** `src/services/PianoHeartbeatService.ts:33`

```typescript
// TODO: 等变成 npm 包后，取消注释
// export class PianoHeartbeatService extends HeartbeatService {
export class PianoHeartbeatService /* extends HeartbeatService */ {
```

The core class is **commented out**. It doesn't extend `HeartbeatService`, so:
- No polymorphic behavior — can't be used where `HeartbeatService` is expected
- The `constructor` has a dead `// TODO: super(db, config);` call
- `executeInternalTask()`, `getSystemStatus()`, `getEssentialKnowledge()`, `extractAndCreateTasks()` are all **empty stubs** with `TODO` comments

This means **the main orchestrator is non-functional**. Only `executePianoTask()` works partially (OpenCode and Pi paths), but the fallback `internal` path is a no-op.

### C2. SQL Injection Risk via String Interpolation in `ContinuousWorkEngine`
**File:** `src/engine/ContinuousWorkEngine.ts:140-155`

While most queries use parameterized `$1, $2` style, some insert values come from **untrusted task data**:

```typescript
await this.pool.query(
  `INSERT INTO tasks (title, description, priority) VALUES ($1, $2, $3)`,
  [`修复: ${task.title}`, `执行失败: ${result.result}`, task.priority + 10]
);
```

`task.title` and `result.result` are interpolated into strings before being passed as parameters. While pg's parameterization handles the values safely, the **logic of constructing SQL-relevant strings from untrusted output** (e.g., `result.result` could contain SQL-like content that confuses logging/debugging) is fragile. More critically, the `analyzeResultAndCreateTasks` method does regex extraction on raw LLM output and inserts it directly — this is a **prompt injection / data integrity risk**, not classic SQL injection, but still worth noting.

### C3. Hardcoded Secrets in Default Config
**File:** `src/services/OpenCodeReminderService.ts:44-46`, `src/services/OpenCodeSessionManager.ts:28-30`

```typescript
password: config.password || process.env.OPENCODE_SERVER_PASSWORD || "nezha-secret",
```

and `src/coordinator/TaskCoordinator.ts:232-234`:

```typescript
password: this.config.opencodeAuth?.password || process.env.OPENCODE_SERVER_PASSWORD || 'nezha-secret',
```

The default password `"nezha-secret"` is hardcoded as a fallback. If env vars aren't set, the system silently uses this known value. This should either throw an error or require explicit configuration.

### C4. Command Injection Risk in `PiExecutor`
**File:** `src/services/PiExecutor.ts:42-43`

```typescript
const escapedDescription = taskDescription.replace(/"/g, '\\"');
const command = `${this.piPath} execute --model ${this.defaultModel} --print "${escapedDescription}"`;
```

The escaping only handles double quotes. A task description containing backticks (`` ` ``), `$()`, or `\n` (newlines) could break out of the shell command. This is a **command injection vulnerability** when `taskDescription` comes from untrusted input (e.g., database, API).

---

## 🟡 Significant Issues

### S1. Duplicate Session Management Logic
Two separate classes manage OpenCode sessions independently:
- `TaskCoordinator.ts` — has its own `createSession()`, `isSessionAlive()`, `waitForCompletion()`, `getAuthHeader()`
- `OpenCodeSessionManager.ts` — full singleton with caching, validation, recreation

`TaskCoordinator` does **not** use `OpenCodeSessionManager`. This means:
- Two independent sessions may be created simultaneously
- Session caching benefits are lost for coordinator operations
- Auth logic is duplicated (with slightly different defaults)

### S2. Duplicated `runNezha()` Helper Across Extensions
**Files:** `extensions/piano-tools.ts`, `extensions/piano-autowork.ts`, `extensions/piano-infra.ts`

All three extension files have identical `runNezha()` functions with the same hardcoded path `/opt/homebrew/bin/nezha`. This should be extracted into a shared utility module.

### S3. `estimateComplexity()` Defined but Never Called
**File:** `src/router/TaskRouter.ts:97-114`

The `estimateComplexity()` private method exists on `TaskRouter` but is **never invoked** anywhere in the codebase. The `shouldDelegate()` method uses hardcoded thresholds instead. This is dead code.

### S4. Magic Numbers Throughout

| Value | Location(s) | Meaning |
|-------|------------|---------|
| `5000` | `TaskCoordinator.ts:27` | Poll interval |
| `300000` | `TaskCoordinator.ts:28` | Completion timeout |
| `60000` | `TaskCoordinator.ts:156` | Idle threshold |
| `600000` | `PiExecutorWrapper.ts:22`, `PiExecutor.ts:36` | Pi timeout (10 min) |
| `12` | `ContinuousWorkEngine.ts:89` | Heartbeat interval counter |
| `999` | `PianoHeartbeatService.ts:50` | Complexity threshold (effectively disables delegation) |
| `10000` | `piano-continuous.ts:6` | Standalone poll interval |

### S5. `ContinuousWorkEngine` Has Unbounded Memory Growth Risk
**File:** `src/engine/ContinuousWorkEngine.ts:79-88`

The `runLoop()` is an infinite `while(this.running)` loop with no backoff on errors. If tasks keep failing or the database is unreachable, it will **poll aggressively** at `pollIntervalMs` rate forever, generating endless error logs.

### S6. Subtask Dependency References Are Broken
**File:** `src/planner/TaskPlanner.ts:39-43`

```typescript
dependsOn: ["analysis"],
```

This references `"analysis"` but the subtask title is `"分析: ${task.title}"` — the dependency ID doesn't match any actual subtask ID/title. The `dependsOn` field references a string that will never match.

### S7. `piano-continuous.ts` Is Standalone Script, Not Integrated
`piano-continuous.ts` is a standalone Node script (shebang `#!/usr/bin/env node`) that duplicates functionality from `ContinuousWorkEngine` but using shell `exec` calls to `nezha` CLI instead of direct DB access. There's also a compiled `piano-continuous.mjs` version. This creates confusion about which is the "official" continuous work engine.

---

## 🟢 Minor Issues

### M1. Missing `vitest` in devDependencies
`package.json` lists `"test": "vitest run"` but `vitest` is not in `devDependencies`.

### M2. Unused Imports
- `TaskRouter.ts:1`: imports `AICapability` from `nezha` — used only for type annotation
- `OpenCodeReminderService.ts:1`: imports `ReminderTemplateService` — only used in one place, coupling to nezha's template system

### M3. `any` Types in Extensions
All three extension files use `pi: any` as the parameter type (`piano-tools.ts:19`, `piano-autowork.ts:22`, `piano-infra.ts:18`). This defeats type safety.

### M4. `deprecated/` Folder Not Cleaned Up
`deprecated/opencode-coupling/` contains old code that should be removed if truly deprecated, or moved to git history.

### M5. Orphaned Files
- `hello_world.txt` — test file that shouldn't be in repo
- `piano-hello` — binary/script artifact
- `old_tsconfig.json` — old config backup
- `README.html` — HTML version of README

### M6. `.gitignore` Could Be Tighter
Missing entries:
- `*.mjs` compiled output (only `dist/` is ignored, but `piano-continuous.mjs` exists at root)
- `bin/nupi` and `bin/piano` could be generated artifacts
- `.nezha/` directory (contains runtime state like cached sessions)

### M7. Inconsistent Error Handling Patterns
Some methods return error objects (e.g., `PiExecutor.execute()` returns `{ success: false, ... }` on failure), while others throw exceptions (e.g., `TaskCoordinator.executeOnOpenCode()`). This makes error handling inconsistent for callers.

### M8. No Graceful Shutdown Signal Handling
Neither `ContinuousWorkEngine` nor `piano-continuous.ts` handle `SIGINT`/`SIGTERM` for clean shutdown.

---

## 📊 Architecture Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Separation of Concerns** | ⭐⭐⭐⭐ | Clear router/coordinator/planner/engine split |
| **Type Safety** | ⭐⭐⭐ | Good interfaces, but `any` in extensions |
| **Error Handling** | ⭐⭐⭐ | Try/catch present but inconsistent patterns |
| **Security** | ⭐⭐ | Command injection, hardcoded secrets |
| **Test Coverage** | ⭐⭐⭐ | Router & Planner tested; others untested |
| **Completeness** | ⭐⭐ | Core orchestrator is a stub |
| **DRY Principle** | ⭐⭐ | Duplicated session management & helpers |
| **Configurability** | ⭐⭐ | Many magic numbers, hardcoded paths |

---

## 🎯 Priority Recommendations (Ordered)

1. **Enable `PianoHeartbeatService` inheritance** — This blocks the primary value proposition of the project
2. **Fix command injection in `PiExecutor`** — Use `spawn` with argument arrays instead of string interpolation
3. **Remove hardcoded default password** — Require explicit auth config or throw
4. **Unify session management** — Make `TaskCoordinator` use `OpenCodeSessionManager`
5. **Extract shared utilities** — Deduplicate `runNezha()` and move constants to config
6. **Fix subtask dependency references** in `TaskPlanner.decompose()`
7. **Add `vitest` to devDependencies** and run the test suite
8. **Clean up orphaned files** and tighten `.gitignore`
9. **Add signal handling** for graceful shutdown
10. **Remove dead code** (`estimateComplexity()` in TaskRouter)

---

# Part 2: Cross-Project Ecosystem Review

**Scope:** `nezha/` (core), `nupi/` (Pi subsystem), `piano/` (our project)
**Date:** 2026-04-03

## Ecosystem Architecture

```
nezha/          ← Core: HeartbeatService, DatabaseClient, Config, Scheduler, AIProvider
  ↑ dependency
nupi/           ← Pi subsystem: PiExecutor (CLI), PiSDKExecutor (SDK)
  ↑ dependency
piano/          ← Task router: TaskRouter, TaskCoordinator, TaskPlanner, ContinuousWorkEngine
```

**Dependency flow:** Piano → nupi → nezha (unidirectional, clean)

---

## 🔴 Critical Cross-Project Findings

### X1. Triple-Copied `PiExecutor` — Piano Has Dead Copy

**The same `PiExecutor` class exists in 3 places with near-identical code:**

| Location | Used? | Notes |
|----------|-------|-------|
| `nezha/src/services/PiExecutor.ts` | ✅ by nezha | Original |
| `nupi/src/services/PiExecutor.ts` | ✅ by nupi + re-exported to piano | Copy |
| **`piano/src/services/PiExecutor.ts`** | ❌ **DEAD CODE** | Third copy, never imported |

**Evidence from piano's own imports:**
```typescript
// piano/src/index.ts - re-exports FROM nupi:
export { PiExecutor } from '@nezha/nupi';       // ← uses nupi's version

// piano/src/executor/PiExecutorWrapper.ts - imports FROM nupi:
import { PiExecutor, type PiTaskResult } from "@nezha/nupi";  // ← uses nupi's version

// piano/src/services/PiExecutor.ts - exists but NOBODY imports it
```

**Piano's local `src/services/PiExecutor.ts` is 100% dead code.** It should be deleted.

### X2. Command Injection Exists in ALL Three Copies

The same vulnerability pattern exists in `nezha`, `nupi`, AND `piano`:

```typescript
// All three copies have this pattern:
const escapedDescription = taskDescription.replace(/"/g, '\\"');
const command = `${this.piPath} execute --model ${this.defaultModel} --print "${escapedDescription}"`;
```

Only double quotes are escaped. Backticks (`` ` ``), `$()`, newlines (`\n`), and semicolons are not. Since this is in the **upstream** `nezha` package, fixing it there propagates to all downstream consumers.

**Fix location:** Should be fixed in `nezha/src/services/PiExecutor.ts` first (source of truth), then nupi/piano update via dependency.

### X3. `HeartbeatService` Is Actually Ready for Extension — Piano Just Needs To Do It

After reading `nezha/src/services/heartbeat/HeartbeatService.ts`, the parent class **already has the extension points Piano needs**:

| Piano Stub Method | Parent (HeartbeatService) | Access | Status |
|---|---|---|---|
| `executeInternalTask()` | `executeInternalAI()` | `protected` | ✅ Ready to call |
| `getSystemStatus()` | `getSystemStatus()` | `protected` | ✅ Ready to call |
| `getEssentialKnowledge()` | `getEssentialKnowledge()` | `protected` | ✅ Ready to call |
| `extractAndCreateTasks()` | Commented-out TODO | `private` (needs `protected`) | ⚠️ Needs small change |

**Key parent method — `executeTask()` is already `protected`:**
```typescript
// HeartbeatService.ts:117
protected async executeTask(
  taskId: string, title: string, description?: string,
  taskType?: string, retryCount = 0, maxRetries = 3
): Promise<void> {
  // TODO: Piano 子类在这里插入路由逻辑
  // const executor = this.taskRouter?.route(title, description);
  await this.executeInternalAI(taskId, title, description, retryCount, maxRetries);
}
```

The parent even has explicit TODO comments for Piano integration. The constructor also hooks up the task callback cleanly:
```typescript
this.scheduler.onTaskReady = this.executeTask.bind(this);
```

**What Piano needs to do:** Simply `extends HeartbeatService`, override `executeTask()`, insert routing logic before calling `super.executeInternalAI()` or branch to opencode/pi paths.

---

## 🟡 Significant Cross-Project Findings

### X4. Extensions Type Safety Gap: nupi vs Piano

**nupi extensions use proper types:**
```typescript
// nupi/extensions/nupi-tools.ts
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
export default function nezhaTools(pi: ExtensionAPI): void { ... }
```

**Piano extensions use `any`:**
```typescript
// piano/extensions/piano-tools.ts (and autowork.ts, infra.ts)
export default function pianoTools(pi: any): void { ... }  // ← loses all type safety
```

All three piano extension files should import `ExtensionAPI` from `@mariozechner/pi-coding-agent`.

### X5. Extension Architecture Divergence: CLI vs Direct DB

| Project | Extension DB Access Method |
|---------|--------------------------|
| **nupi** | Direct `pg.Client` connection with proper config from env vars |
| **piano** | `execSync('node /opt/homebrew/bin/nezha ${command}')` CLI calls |

Piano's approach has issues:
- **Hardcoded path**: `/opt/homebrew/bin/nezha` won't work on other systems
- **Fragile parsing**: Parses stdout/stderr as text
- **Slow**: Spawns a new Node process per command
- **No type safety**: String-based command interface

nupi's approach of direct pg connections is cleaner, faster, and more portable. Piano should follow nupi's pattern.

### X6. Duplicate Auto-Work Logic Across Projects

Both `piano/extensions/piano-autowork.ts` and `nupi/extensions/nupi-autowork.ts` implement nearly identical autonomous work modes with:
- Same prompt structure (priority list, workflow steps, core principles)
- Same session_start hook
- Same start command registration

These should be consolidated into one shared implementation.

### X7. Duplicate Session Management: Piano vs Nezha Patterns

`OpenCodeSessionManager.ts` in piano implements session caching + singleton, while `TaskCoordinator.ts` has its own inline session management. Meanwhile, nezha doesn't have a shared session manager at all — each service manages its own session.

This means across the ecosystem there are **3 different session management approaches**. The one in `OpenCodeSessionManager.ts` is the most mature (caching, validation, dedup). Consider extracting it to `nezha` as a shared utility.

### X8. `ContinuousWorkEngine` vs `Scheduler` Overlap

`ContinuousWorkEngine.ts` in piano implements its own task polling loop:
```typescript
while (this.running) {
  this.currentTaskPromise = this.processOneTask();  // fetch from DB, execute, update status
  await new Promise(r => setTimeout(r, pollInterval));
}
```

But nezha's `Scheduler.ts` already provides:
- Database-driven task scheduling (`Scheduler` class)
- Event bus integration (`EventBus`)
- Failure tracking with pause logic (`consecutiveFailures`, `pauseUntil`)
- Stuck task detection
- Plugin system integration

`ContinuousWorkEngine` duplicates ~60% of Scheduler's functionality without its robustness (no backoff, no stuck detection, no event bus).

---

## 🟢 Positive Cross-Project Observations

### ✅ Clean Dependency Direction
- Piano → nupi → nezha (no circular dependencies)
- Piano correctly re-exports types from nupi: `export { PiExecutor } from '@nezha/nupi'`
- Piano correctly imports core types from nezha: `HeartbeatService`, `DatabaseClient`, `Config`, `TASK_STATUS`, etc.

### ✅ Correct Use of Config System
`PianoHeartbeatService.ts:56`:
```typescript
const opencodeUrl = config?.opencodeUrl ||
  Config.getInstance().getTransportConfig().opencodeApiUrl;
```
Properly falls back to nezha's centralized config when no explicit URL is provided.

### ✅ Shared Constants Used Correctly
Piano uses `DATABASE_TABLES.TASKS`, `TASK_STATUS.COMPLETED`, etc. from nezha — no magic strings for DB table names or statuses.

### ✅ Nupi Has Two Execution Paths (Pattern Piano Could Follow)
nupi provides both `PiExecutor` (CLI-based, like piano's wrapper) AND `PiSDKExecutor` (SDK-based, using `@mariozechner/pi-coding-agent` directly). Piano only uses the CLI path via `PiExecutorWrapper`. The SDK path could be more reliable.

---

## 📋 Updated Priority Action List (Revised After Cross-Project Review)

### Phase 1: Enable Core Inheritance (Unblocks Everything Else)

1. **Delete dead `piano/src/services/PiExecutor.ts`** — it's a third copy that nobody imports
2. **Enable `PianoHeartbeatService extends HeartbeatService`** — uncomment inheritance, wire up constructor, implement stub methods using parent's `protected` helpers
3. **Override `executeTask()` in PianoHeartbeatService** — insert TaskRouter logic, branch to opencode/pi/internal

### Phase 2: Fix Security (Upstream-First)

4. **Fix command injection in `nezha/src/services/PiExecutor.ts`** — switch from string interpolation to `spawn` with argument array; this fix propagates to nupi & piano automatically
5. **Remove hardcoded `"nezha-secret"` default password** across all three projects; require explicit config

### Phase 3: Consolidate Duplicates

6. **Make `TaskCoordinator` use `OpenCodeSessionManager`** instead of inline session logic
7. **Extract shared `runNezha()` utility** from 3 piano extension files into one module
8. **Replace `any` with `ExtensionAPI` type** in all 3 piano extension files
9. **Consider: extract `OpenCodeSessionManager` to `nezha`** as shared utility (affects all 3 projects)
10. **Consider: consolidate auto-work extensions** between nupi and piano

### Phase 4: Polish

11. **Fix subtask dependency references** in `TaskPlanner.decompose()`
12. **Add `vitest` to devDependencies**, run test suite
13. **Clean up orphaned files**, tighten `.gitignore`
14. **Add signal handling** for graceful shutdown in `ContinuousWorkEngine`
15. **Remove dead code** (`estimateComplexity()` in TaskRouter)
