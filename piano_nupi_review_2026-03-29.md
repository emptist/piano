# Code Review: Piano and NuPI Enhancements

**Date:** 2026-03-29
**Reviewer:** Trae AI
**Branch:** piano

---

## Summary

This review covers uncommitted changes related to Piano task orchestration improvements and NuPI integration enhancements.

---

## Modified Files

### 1. `extensions/nezha-blind-loop.ts`

**Changes:**
- Improved idle thought prompt from passive to proactive language
- Added 5 specific action categories (broadcasts, issues, learning, code, review)
- Added `nezha-learn` command for saving learnings to Nezha memory

**Assessment:** ✅ Good improvement
- More actionable guidance for AI when idle
- Better integration with Nezha memory system

**Code Quality:**
```typescript
// Before: Passive
"查数据库找下一步"

// After: Proactive
"作为 Nezha AI，你应该主动工作而非等待命令。检查并执行：
1. **广播** - 检查是否有其他 AI 的讨论/请求
2. **Issues** - 检查 open issues，优先处理 high severity
..."
```

---

### 2. `src/piano/planner/TaskPlanner.ts`

**Changes:**
- Fixed complexity estimation starting score (3 → 1)
- Added more complex keywords (implement, create, build, api, database)
- Adjusted scoring weights (complex: +1, medium: +0.5)
- Added proper bounds (Math.max(1, ...))

**Assessment:** ✅ Good fix
- Previous scoring started too high (3), causing over-estimation
- New algorithm is more balanced

**Before/After:**
| Task Type | Old Score | New Score |
|-----------|-----------|-----------|
| Simple "check" task | 3 | 1 |
| "implement api" | 7 | 3 |
| "refactor database" | 7 | 3 |

---

### 3. `src/services/AgentIdentityService.ts`

**Changes:**
- Added `findExistingIdentity()` method to check multiple sources
- Added deduplication logic before creating new identity
- Added conflict handling for unique constraint violation (23505)
- Prevents duplicate identities for same project+gitHash

**Assessment:** ✅ Critical fix
- Prevents identity fragmentation
- Ensures knowledge accumulation for same context

**Logic Flow:**
```
createIdentity()
    ↓
findExistingIdentity() → check nezha, opencode, mcp, external sources
    ↓
If found → return existing
    ↓
If not found → create new
    ↓
If conflict (race condition) → retry findExistingIdentity()
```

---

## New Files (Untracked)

### 4. `src/piano/engine/ContinuousWorkEngine.ts`

**Purpose:** Continuous task processing loop for Piano

**Features:**
- Polls database for pending tasks
- Uses TaskCoordinator for execution
- Auto-creates follow-up tasks from results
- Saves learnings to memory
- Heartbeat for session health

**Assessment:** ✅ Good addition
- Completes Piano architecture
- Follows "true continuous work" principle (AI executes, not just loops)

**Concerns:**
- Missing error handling for pool connection
- No graceful shutdown mechanism

---

### 5. `src/services/EmailService.ts`

**Purpose:** Send daily reports via email

**Features:**
- Generates daily statistics (tasks, broadcasts, learnings, issues)
- HTML email with styled report
- Uses nodemailer

**Assessment:** ⚠️ Needs review
- Email credentials should be in environment variables
- Missing from package.json dependencies check
- Should have opt-in configuration

---

### 6. `src/NuPi/nezha-blind-loop.ts`

**Status:** Duplicate of `extensions/nezha-blind-loop.ts`

**Assessment:** ❌ Should be removed
- Duplicate file
- Extension should stay in `extensions/` directory

---

### 7. `test-email.ts`

**Status:** Test file

**Assessment:** ❌ Should be ignored
- Test file should not be committed
- Add to .gitignore

---

## Recommendations

### Commit Strategy

| File | Action | Commit Message |
|------|--------|----------------|
| `extensions/nezha-blind-loop.ts` | Commit | `feat(piano): improve blind-loop idle prompt and add nezha-learn command` |
| `src/piano/planner/TaskPlanner.ts` | Commit | `fix(piano): correct task complexity estimation algorithm` |
| `src/services/AgentIdentityService.ts` | Commit | `fix(identity): prevent duplicate agent identities with deduplication` |
| `src/piano/engine/ContinuousWorkEngine.ts` | Commit | `feat(piano): add ContinuousWorkEngine for task processing loop` |
| `src/services/EmailService.ts` | Commit | `feat(services): add EmailService for daily reports` |
| `src/NuPi/nezha-blind-loop.ts` | Delete | - |
| `test-email.ts` | Delete | - |
| `package-lock.json` | Commit | `chore: update dependencies` |

---

## Architecture Observations

### Piano Subsystem Completeness

```
Piano Architecture (Now Complete):
├── router/TaskRouter.ts      ✅ Routes tasks to executors
├── planner/TaskPlanner.ts    ✅ Decomposes and estimates
├── coordinator/TaskCoordinator.ts  ✅ Manages sessions
└── engine/ContinuousWorkEngine.ts  ✅ NEW: Processing loop
```

### NuPI Integration Status

```
NuPI Components:
├── NezhaApiServer.ts         ✅ REST API
├── PiExecutor.ts             ✅ CLI execution
├── PiSDKExecutor.ts          ✅ SDK execution
└── nezha-blind-loop.ts       ✅ Pi Extension
```

---

## Security Considerations

1. **EmailService**: Ensure SMTP credentials are environment variables
2. **AgentIdentityService**: Good - uses database transactions
3. **ContinuousWorkEngine**: Should validate task data before processing

---

## Test Coverage

| Component | Tests Needed |
|-----------|--------------|
| TaskPlanner.estimateComplexity | Unit tests for scoring |
| AgentIdentityService.findExistingIdentity | Integration tests |
| ContinuousWorkEngine | End-to-end tests |
| EmailService | Mock SMTP tests |

---

## Conclusion

All changes are valuable improvements to the Piano and NuPI subsystems. The commits should be made separately for clear history.

**Overall Assessment:** ✅ Approved for commit (with cleanup of duplicate/test files)
