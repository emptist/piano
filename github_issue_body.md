# 🚨 CRITICAL: Git History Integrity Incident - Improper Reset on Shared Branches (2026-04-05)

## Severity: HIGH - History Corruption

### Summary
A critical git history integrity issue was discovered involving **improper use of `git reset` on shared branches** (`develop` and `master`), resulting in orphaned merge commits, broken ancestry relationships, and duplicated code changes.

**No functional code was lost**, but the **git history is now inaccurate and misleading**.

---

## Timeline of Events

### Phase 1: Normal Development ✅
- `02:49` - `f197209`: Fix hardcoded credentials in OpenCodeSessionManager
- `08:14` - `3366e88`: Migrate OpenCodeReminderService to HTTP API
- `08:25` - `7ac1b45`: i18n translations (Chinese → English)

All on `phase3-piano-cleanup` branch - **normal workflow**

### Phase 2: Initial Merge ✅
- `08:30` - `c37e3fb`: Merged phase3-piano-cleanup into develop

### Phase 3: ⚠️ CRITICAL INCIDENT
- `08:47` - **DOUBLE RESET on develop**:
  1. `git reset --hard HEAD~1` (undid README commit)
  2. `git reset --hard HEAD~1` (**undid the MERGE COMMIT c37e3fb!**)

### Phase 4: Re-application ⚠️
- `08:47` - `d9902d9`: Re-applied same changes + README update (messy commit)
- `08:49` - `34f9be2`: TaskRouter fix

### Phase 5: Propagation 🔴
- `09:00` - `d3cf544`: Merged corrupted develop into master → **PUSHED TO ORIGIN**

---

## Current State Analysis

### Branch Graph (BROKEN)
```
Expected:  master → develop → c37e3fb → [phase3 commits]
Actual:    master → develop → e25e7d0 (skips merge!)
                        ↘ phase3-piano-cleanup (orphaned, divergent)
```

### Critical Findings

#### 1. Orphaned Merge Commit 🚨
- **Commit:** `c37e3fb`
- **Status:** NOT in any branch (`git branch --contains` returns empty)
- **Impact:** 33 files, 2452 insertions, 933 deletions - **DANGLING**
- **Will be:** Garbage collected eventually

#### 2. Duplicated Code Changes ⚠️
Same changes exist in TWO locations:

| Change | Original (Orphaned) | Current (develop/master) |
|--------|---------------------|--------------------------|
| Credentials fix | f197209 | Inside d9902d9 |
| HTTP API migration | 3366e88 | Inside d9902d9 |
| i18n translations | 7ac1b45 | Inside d9902d9 |

**Consequence:** Git blame shows wrong author/timestamp for security fixes!

#### 3. Merge Conflicts Identified 🔴
Merging `phase3-piano-cleanup` into master will cause conflicts:
- **README.md**: Major conflicts (English vs Chinese versions, different sections)
- **TaskRouter.ts**: Minor differences (16 lines)
- **vitest.config.ts**: Missing in phase3 (9 lines)

Tested with: `git merge-tree $(git merge-base master phase3-piano-cleanup) master phase3-piano-cleanup`

---

## Impact Assessment

### Immediate
- ✅ **Code Functionality:** No impact - all changes present
- ⚠️ **Git History:** Severely compromised
- 🚨 **Branch Relationships:** Broken

### Future Risks
- 🔴 **Code Reviews:** Cannot track original change rationale
- 🔴 **Debugging:** Git blame wrong for credential fix (security concern!)
- 🔴 **Merging:** phase3-piano-cleanup cannot cleanly merge
- 🔴 **Compliance:** Audit trail broken for security fix
- 🟡 **CI/CD:** Works but builds on corrupted foundation

---

## Repair Options

### Option 1: Git Replace (🟢 Least Disruptive)
Use `git replace --graft` to rewrite history locally without force-push.
- **Pros:** Safe, no force-push needed
- **Cons:** Team must fetch replace refs
- **Risk:** LOW

### Option 2: Reset & Rebase (🔴 Cleanest but Disruptive)
Reset branches to before bad resets, cherry-pick correctly.
- **Pros:** Clean history, proper attribution
- **Cons:** Requires force-push + team coordination
- **Risk:** HIGH

### Option 3: Accept & Document (🟡 Pragmatic)
Accept current state, document thoroughly, delete orphaned branch.
- **Pros:** Zero disruption, immediate
- **Cons:** History stays inaccurate forever
- **Risk:** MEDIUM

### Option 4: Hybrid (✅ RECOMMENDED)
Use Option 3 today, schedule Option 2 for next maintenance window.
- **Pros:** Avoids emergency, allows planning
- **Cons:** Two-phase approach
- **Risk:** LOW with planning

**My Recommendation:** Option 4 (Hybrid)

---

## Prevention Measures (Implement TODAY)

### Immediate Actions Required:

#### 1. Server-Side Hook: Block Force-Push
```bash
# Add to GitHub/GitLab branch protection rules:
# - Block force-pushes to master/develop/main
# - Require PR for merges
# - Require status checks
```

#### 2. Client-Side Hook: Warn on Reset
```bash
# .git/hooks/pre-reset
#!/bin/bash
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
if [[ "$branch" == "master" || "$branch" == "develop" ]]; then
    echo "⚠️  WARNING: Resetting shared branch $branch!"
    echo "Press Ctrl+C to abort"
    read -r
fi
```

#### 3. Update Team Guidelines
```
## FORBIDDEN on master/develop/main:
- ❌ git reset --hard
- ❌ git push --force
- ❌ git commit --amend (after push)

## REQUIRED:
- ✅ Use git revert for mistakes
- ✅ Use feature branches
- ✅ Merge (don't rebase) shared branches
```

---

## Evidence

### Reflog Forensics
```
c37e3fb refs/heads/develop@{3}: merge phase3-piano-cleanup: Merge made by 'ort'
e25e7d0 refs/heads/develop@{2}: reset: moving to HEAD~1  ← FIRST RESET
e25e7d0 refs/heads/develop@{3}: reset: moving to HEAD~1  ← SECOND RESET (KILLED THE MERGE!)
```

### Key Commits
| Hash | Status | Description |
|------|--------|-------------|
| f197209 | Orphaned | Remove credentials (security fix) |
| 3366e88 | Orphaned | HTTP API migration |
| 7ac1b45 | Orphaned | i18n English translation |
| **c37e3fb** | **ORPHANED** | **The lost merge commit** |
| e25e7d0 | Current base | Before resets |
| d9902d9 | Current | Contains duplicated work |
| d3cf544 | Pushed | Corrupted state on origin |

### Full Report
See detailed analysis: [INCIDENT_REPORT_2026-04-05.md](INCIDENT_REPORT_2026-04-05.md)

---

## Action Items

### For Today:
- [ ] **Choose repair strategy** (recommend Option 4: Hybrid)
- [ ] **Implement prevention hooks** (items 1-3 above)
- [ ] **Notify team** of incident and remediation plan
- [ ] **Decide fate of phase3-piano-cleanup branch** (delete or merge with conflict resolution)

### This Sprint:
- [ ] Schedule maintenance window for full history repair (if Option 2/4)
- [ ] Review other recent commits for similar issues
- [ ] Update CI to detect anomalous patterns

### Ongoing:
- [ ] Monitor reflog for suspicious operations
- [ ] Quarterly git safety training
- [ ] Update onboarding documentation

---

## Root Cause & Lessons Learned

### What Happened
Someone executed `git reset --hard HEAD~1` **twice** on the `develop` branch after merging `phase3-piano-cleanup`. The second reset accidentally removed the merge commit, orphaning all phase3 work.

### Why It's Dangerous
1. **Reset destroys history** that others may base work on
2. **Reseting past a merge** orphans entire branch's commits
3. **Re-applying manually** creates duplicate commits with wrong metadata
4. **Pushing to remote** propagates problem to everyone

### The Golden Rule
> **Never use `git reset --hard` on shared/pushed branches. Always use `git revert`.**

---

## Comments & Discussion

Please comment below with:
1. ✅ Which repair option you prefer (1/2/3/4)?
2. ✅ When can we schedule the fix (if Option 2/4)?
3. ✅ Any concerns about the proposed prevention measures?
4. ✅ Should we delete phase3-piano-cleanup or attempt conflict resolution?

**Priority:** Critical - needs decision within 24 hours to prevent further complications

---
