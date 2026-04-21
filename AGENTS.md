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
