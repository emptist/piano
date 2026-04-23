# Piano Agent Guide

> **I am Piano** - Thinking Router
>
> Piano = Thinking Router + Pi + Nezha + OpenCode
>
> - Routes complex thinking to OpenCode via SDK (serve)
> - Uses nezha via CLI for persistence
> - No direct imports - CLI only
> - NO programmatic loop (autonomy = AI collaboration, NOT timer)

## ⚠️ 重要：先读本文件

**开始工作前必须先阅读本文件，了解可用的工具和系统。**

## ⚠️ 注意 AGENTS.md vs README.md

- **README.md**: 人类和AI共用，包含使用说明
- **AGENTS.md**: 仅AI阅读，包含AI如何与系统交互

## Identity

```
Role: Thinking router + autonomous task executor
Works with: NuPI (execution), Nezha (persistent brain), OpenCode (deep thinking)
Tools: Pi built-ins + piano tools + nezha CLI
```

## Architecture

```
Piano = Router + Pi Extension + Nezha CLI
              │
              ├── piano_think → OpenCode via SDK (serve + HTTP)
              ├── nezha_get_tasks → View tasks via CLI
              └── nezha_create_task → Create task via CLI
```

## NPM Link (Official Method!)

**ALWAYS use `npm link` - NEVER create symlinks manually!**

```bash
# Link locally for development
cd /path/to/piano
npm link              # Creates global symlink

# Verify
npm list -g --depth=0 | grep piano
```

## Development Workflow (IMPORTANT!)

### Quick: Use the dev-link script

```bash
cd /Users/jk/gits/hub/tools_ai/piano
./scripts/dev-link.sh
```

This builds, links, and verifies the hash automatically.

### Manual (if script fails)

```bash
# 1. Make code changes
cd /Users/jk/gits/hub/tools_ai/piano
# edit files...

# 2. Build
rm -rf dist && npm run build

# 3. Verify hash
grep GIT_HASH dist/src/extension.js
# Should show latest commit hash

# 4. Link to global (CRITICAL!)
npm link

# 5. Verify global is updated
grep GIT_HASH $(npm root -g)/@nezha/piano/dist/src/extension.js
# Must match step 3!
```

### Why this matters:
- Piano shows `[Piano@HASH]` in logs
- If global runs old code, you'll see old hash
- Always verify after linking!

## How to Use

```bash
# Start Piano in project directory
piano

# This starts autonomous mode:
# 1. Checks Nezha for pending tasks
# 2. Processes highest priority tasks via OpenCode
# 3. Cycles every 5 minutes
```

## Architecture Flow

```
Human types: piano
    ↓
NuPI (PI + NEZHA + external thinker flag)
    ↓ when thinking needed
Piano extension (registered in Pi)
    ↓ calls ACP
OpenCode (via stdio ND-JSON)
    ↓ returns result
Piano → NuPI → Nezha (stores learning)
```

## Known Issues

- Task filter too strict: `priority >= 80` skips most tasks
- Tasks not marked COMPLETED after execution
- ACP fallback returns text instead of executing
- AI agents default to low priority → self-filtering

## Key Rules

- ✅ Use CLI: `nezha task-add`, `nezha issue-add`, `nezha areflect`, etc.
- ✅ Use `piano_think` for complex reasoning
- ✅ Run `piano` in project directory for autonomous mode
- ✅ Use `npm link` for local development
- ❌ No HTTP fetch to 5999
- ❌ No direct imports (uses CLI instead)
- ❌ NEVER create symlinks manually (use npm link)
