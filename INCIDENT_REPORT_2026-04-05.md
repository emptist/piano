# Git Branch/Commit Integrity Analysis Report

**Date:** 2026-04-05
**Repository:** piano (git@github.com:emptist/piano.git)
**Analyzer:** Automated Analysis System
**Severity:** HIGH - History corruption with potential data loss

---

## Executive Summary

A critical git history integrity issue was discovered in the `piano` repository. The incident involves **improper use of `git reset` on shared branches**, resulting in:
- Orphaned merge commits
- Broken branch ancestry relationships  
- Duplicated code changes across different commits
- Potential merge conflicts for the `phase3-piano-cleanup` branch

While **no code changes were lost** (they were re-applied in later commits), the **git history is now inaccurate and misleading**, which will cause significant problems for future development, code reviews, and debugging.

---

## Timeline of Events (2026-04-05)

### Phase 1: Feature Development (02:49 - 08:25)
```
02:49 - f197209: fix(piano): remove hardcoded credentials from OpenCodeSessionManager
08:14 - 3366e88: refactor(piano): migrate OpenCodeReminderService from direct DB to HTTP API
08:25 - 7ac1b45: i18n(piano): translate all Chinese text to English
```
✅ All commits made on `phase3-piano-cleanup` branch - **NORMAL**

### Phase 2: Initial Merge Attempt (08:30)
```
08:30 - c37e3fb: merge phase3-piano-cleanup into develop (MERGE COMMIT)
```
✅ Merge created successfully - **NORMAL**

### Phase 3: ⚠️ CRITICAL INCIDENT - Improper Resets (08:47 - 08:49)
```
08:47 - e25e7d0: RESET develop to HEAD~1 (undid commit d9902d9 - README update)
08:47 - e25e7d0: RESET develop to HEAD~1 again (undid MERGE COMMIT c37e3fb)
```
🚨 **CRITICAL ERROR**: Two `git reset --hard HEAD~1` operations on `develop` branch

### Phase 4: Re-application of Changes (08:47 - 08:49)
```
08:47 - d9902d9: docs: update README... (re-applied, includes OpenCodeReminderService + SessionManager changes)
08:49 - 34f9be2: fix: TaskRouter route priority (new commit on top of reset)
```
⚠️ Changes re-applied but in different commit structure - **PROBLEMATIC**

### Phase 5: Final Integration (09:00)
```
09:00 - d3cf544: merge develop into master (PUSHED TO ORIGIN)
```
⚠️ Corrupted history pushed to remote - **PROPAGATED**

---

## Current State Analysis

### Branch Structure
```
master (d3cf544) ← develop (34f9be2)
                  ↘
                   phase3-piano-cleanup (7ac1b45)
```

### Critical Findings

#### 1. **Orphaned Merge Commit**
- **Commit:** `c37e3fb` (merge phase3-piano-cleanup into develop)
- **Status:** NOT contained in any branch (`git branch --contains c37e3fb` returns empty)
- **Impact:** This commit is dangling and will be garbage collected eventually
- **Changes:** 33 files changed, 2452 insertions, 933 deletions

#### 2. **Duplicated Code Changes**
The same code changes exist in TWO different locations:

| Change | Original Location | Current Location (in develop/master) |
|--------|------------------|--------------------------------------|
| OpenCodeSessionManager credentials fix | f197209 | d9902d9 |
| OpenCodeReminderService HTTP API migration | 3366e88 | d9902d9 |
| i18n English translations (6 files) | 7ac1b45 | d9902d9 |

**Problem:** Git blame will show wrong author/timestamp for these changes.

#### 3. **Broken Ancestry**
```
Expected:  master → develop → c37e3fb → phase3-piano-cleanup commits
Actual:    master → develop → e25e7d0 (skips c37e3fb entirely)
                          ↘ phase3-piano-cleanup (divergent, not merged)
```

#### 4. **Merge Conflicts Identified**
When attempting to merge `phase3-piano-cleanup` into `master`:

**Conflicting Files:**
- [ ] README.md - Major conflicts (English vs Chinese versions, different sections)

**Non-conflicting Differences:**
- src/router/TaskRouter.ts - Minor differences (16 lines)
- vitest.config.ts - Missing file in phase3-piano-cleanup (9 lines removed)

---

## Root Cause Analysis

### What Went Wrong

The reflog reveals the exact sequence:
```bash
# At 08:47 on develop branch
git reset --hard HEAD~1  # Undid d9902d9 (README update)
git reset --hard HEAD~1  # Undid c37e3fb (THE MERGE COMMIT!)
```

This appears to be an **accidental double-reset** or **misunderstanding of git state** after the first reset.

### Why This Is Dangerous

1. **`git reset --hard` on shared branches** destroys history that others may have based work on
2. **Reseting past a merge commit** orphanes all commits from the merged branch
3. **Re-applying changes manually** creates duplicate commits with different metadata
4. **Pushing reset state to remote** propagates the problem to all collaborators

---

## Impact Assessment

### Immediate Impact
- ✅ **Code Functionality:** No impact - all changes are present in current branches
- ⚠️ **Git History:** Severely compromised - inaccurate attribution and timeline
- 🚨 **Branch Relationships:** Broken - phase3-piano-cleanup appears unmerged

### Future Impact
- 🔴 **Code Reviews:** Impossible to track original change rationale
- 🔴 **Debugging:** Git blame shows wrong commit for security fixes (credentials)
- 🔴 **Merging:** phase3-piano-cleanup cannot be cleanly merged (conflicts expected)
- 🔴 **Compliance:** Audit trail broken for the credential removal fix
- 🟡 **CI/CD:** May work but builds on corrupted foundation

---

## Repair Strategies

### Option 1: Git Replace (Recommended - Least Disruptive)

**Approach:** Use `git replace` to rewrite history locally without force-pushing

**Pros:**
- Doesn't require force-push (safer for collaborators)
- Preserves all commit hashes for already-pushed commits
- Can be done incrementally

**Cons:**
- Requires all developers to fetch the replace refs
- More complex to set up

**Steps:**
```bash
# 1. Create replacement graft to make c37e3fb part of develop history
git replace --graft c37e3fb e25e7d0 7ac1b45

# 2. Verify the new graph looks correct
git log --oneline --graph --all

# 3. Export replacements for team
git replace -l > .git/replace-info
```

**Risk Level:** 🟢 LOW

---

### Option 2: Reset & Rebase (Clean History - Moderate Disruption)

**Approach:** Reset develop/master to before the bad resets, then cherry-pick/rebase correctly

**Pros:**
- Creates clean, accurate history
- Properly attributes all changes
- Eliminates duplicate commits

**Cons:**
- **Requires force-push** (all collaborators must re-clone or reset)
- Changes all commit hashes after the reset point
- High coordination cost

**Steps:**
```bash
# WARNING: This requires force-push and coordination!

# 1. Backup current state
git branch backup-master-before-fix master
git branch backup-develop-before-fix develop

# 2. Reset develop to e25e7d0 (before the bad resets)
git checkout develop
git reset --hard e25e7d0

# 3. Cherry-pick the individual clean commits (not the messy d9902d9)
git cherry-pick f197209  # credentials fix
git cherry-pick 3366e88  # HTTP API migration
git cherry-pick 7ac1b45  # i18n translations

# 4. Add the README update as separate commit
# (make README changes manually or from d9902d9 diff)
git add README.md
git commit -m "docs: update README with API architecture"

# 5. Add TaskRouter fix
git cherry-pick 34f9be2

# 6. Update master
git checkout master
git reset --hard develop

# 7. FORCE PUSH (dangerous!)
git push --force origin master
git push --force origin develop
```

**Risk Level:** 🔴 HIGH (requires team coordination)

---

### Option 3: Accept & Document (Pragmatic - No Disruption)

**Approach:** Accept the current state, document what happened, and move forward

**Pros:**
- Zero disruption to team
- No force-push required
- Immediate resolution

**Cons:**
- History remains inaccurate
- Must remember the anomaly forever
- Confusing for new contributors
- phase3-piano-cleanup branch becomes obsolete (delete it)

**Steps:**
```bash
# 1. Document the incident thoroughly (this report!)
# 2. Delete the orphaned phase3-piano-cleanup branch
git branch -D phase3-piano-cleanup

# 3. Add git note to d3cf5d4 explaining the situation
git notes add -m "WARNING: This merge follows improper git reset operations.
See INCIDENT_REPORT_2026-04-05.md for details.
The phase3-piano-cleanup changes were re-applied in d9902d9 after accidental reset." d3cf544

# 4. Proceed with normal development
```

**Risk Level:** 🟡 MEDIUM (technical debt)

---

### Option 4: Hybrid Approach (Recommended for Active Teams)

**Approach:** Use Option 3 now, schedule Option 2 for next maintenance window

**Rationale:**
- Avoids emergency force-push during active development
- Gives team time to prepare
- Can be done during planned downtime

**Timeline:**
- **Today:** Document incident, delete orphaned branch, add warnings
- **Next sprint boundary:** Coordinate team, execute Option 2 cleanup

**Risk Level:** 🟢 LOW (with proper planning)

---

## Prevention Measures

### Immediate Actions (Implement Today)

#### 1. **Server-Side Hook: Block Force-Push to Master/Develop**
```bash
# .git/hooks/pre-receive (server-side)
#!/bin/bash
while read oldrev newrev refname; do
    if [[ "$refname" == "refs/heads/master" || "$refname" == "refs/heads/develop" ]]; then
        if [[ "$oldrev" != "0000000000000000000000000000000000000000" ]]; then
            # Check for force-push (non-fast-forward)
            if ! git merge-base --is-ancestor "$oldrev" "$newrev" 2>/dev/null; then
                echo "ERROR: Force-push to $refname is blocked!"
                exit 1
            fi
        fi
    fi
done
exit 0
```

#### 2. **Client-Side Hook: Warn on Reset Shared Branches**
```bash
# .git/hooks/pre-reset
#!/bin/bash
branch=$(git symbolic-ref --short HEAD 2>/dev/null)
if [[ "$branch" == "master" || "$branch" == "develop" || "$branch" == "main" ]]; then
    echo "⚠️  WARNING: You are about to reset $branch!"
    echo "This is a shared branch. Are you sure? (Ctrl+C to abort)"
    read -r confirmation
fi
exit 0
```

#### 3. **Add to Team Guidelines**
```
## Git Safety Rules

### FORBIDDEN (unless emergency with team approval):
- ❌ git reset --hard on master/develop/main
- ❌ git push --force to master/develop/main
- ❌ git commit --amend on pushed commits

### REQUIRED:
- ✅ Use git revert for fixing pushed mistakes
- ✅ Create feature branches for all work
- ✅ Merge (don't rebase) shared branches
- ✅ Pull before pushing to avoid conflicts
```

### Long-Term Process Improvements

#### 4. **Branch Protection Rules (GitHub/GitLab)**
Enable in repository settings:
- ✅ Require pull request for master/develop
- ✅ Block force-pushes
- ✅ Require status checks to pass
- ✅ Require at least 1 review

#### 5. **Pre-commit Checklist**
Before any destructive operation:
```bash
# Run this diagnostic script
#!/bin/bash
echo "=== Pre-Destructive Operation Checklist ==="
echo "Branch: $(git branch --show-current)"
echo "Ahead: $(git rev-list --count origin/$(git branch --show-current)..HEAD) commits"
echo "Has remote: $(git ls-remote --heads origin $(git branch --show-current) | wc -l)"
echo ""
read -p "Type 'DESTROY' to continue: " confirm
if [[ "$confirm" != "DESTROY" ]]; then
    echo "Aborted."
    exit 1
fi
```

#### 6. **Training & Documentation**
- Add git safety training to onboarding
- Include this incident report in team knowledge base
- Quarterly git best practices review

---

## Recommendations

### For Immediate Action (Today):
1. ✅ **Choose repair strategy** (recommend Option 4: Hybrid)
2. ✅ **Document decision** in GitHub issue
3. ✅ **Implement prevention hooks** (items 1-3 above)
4. ✅ **Notify team** of the incident and remediation plan

### For This Sprint:
1. 📋 Schedule maintenance window for full history repair (if choosing Option 2/4)
2. 📋 Review all recent commits for similar issues
3. 📋 Update CI to detect anomalous git patterns

### Ongoing:
1. 🔍 Monitor git reflog for suspicious operations
2. 📊 Track branch hygiene metrics
3. 📚 Regular team training on git safety

---

## Technical Appendix

### Commands Used for Analysis
```bash
# View today's commits
git log --all --oneline --since="2026-04-05" --graph --decorate

# Check branch containment
git branch --contains c37e3fb  # Returns nothing = orphaned

# View reflog for forensic analysis
git reflog --all --since="2026-04-05"

# Identify merge conflicts without merging
git merge-tree $(git merge-base master phase3-piano-cleanup) master phase3-piano-cleanup

# Compare file contents between branches
git diff develop phase3-piano-cleanup --stat
```

### Key Commits Reference
| Hash | Branch | Description | Status |
|------|--------|-------------|--------|
| f197209 | phase3-piano-cleanup | Remove hardcoded credentials | Orphaned (in phase3 only) |
| 3366e88 | phase3-piano-cleanup | Migrate to HTTP API | Orphaned (in phase3 only) |
| 7ac1b45 | phase3-piano-cleanup | i18n English translation | Orphaned (in phase3 only) |
| c37e3fb | NONE (orphaned) | Merge phase3→develop | **ORPHANED** - not in any branch |
| e25e7d0 | develop/master | Base before resets | Current base |
| d9902d9 | develop/master | Re-applied changes + README | Contains duplicated work |
| 34f9be2 | develop/master | TaskRouter fix | Clean |
| d3cf544 | master (origin) | Final merge | Pushed to remote |

---

## Conclusion

This incident represents a **significant git history integrity violation** caused by improper use of `git reset --hard` on shared branches. While no functional code was lost, the **historical record is corrupted**, which will impact:

- Code review traceability
- Debugging via git blame
- Future merge operations
- Audit compliance

**The recommended path forward** is the **Hybrid Approach (Option 4)**:
1. Accept current state immediately to avoid disruption
2. Implement strict prevention measures today
3. Schedule complete history repair during next maintenance window

**Critical lesson:** Never use `git reset --hard` on shared branches. Always use `git revert` for published commits.

---

**Report Generated:** 2026-04-05T15:22:20+08:00
**Analysis Tool Version:** 1.0.0
**Next Review Date:** 2026-04-12 (1 week follow-up recommended)
