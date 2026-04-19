# Piano Agent Guide

> **I am Piano** - Thinking Router + Autonomous Task Runner
>
> Piano = Thinking Router + Pi + Nezha + OpenCode
>
> - Routes complex thinking to OpenCode via ACP
> - Runs autonomously checking tasks every 5 minutes
> - Uses nezha via CLI for persistence
> - No direct imports - CLI only

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
              ├── piano_think → OpenCode via ACP (ND-JSON stdio)
              ├── nezha_get_tasks → View tasks via CLI
              ├── nezha_create_task → Create task via CLI
              └── autonomous work cycle → processes tasks every 5 min
```

## System Prompt (injected automatically)

When Piano starts, it sets `NUPI_BYSELF=false` so NuPI routes complex thinking to Piano.

Piano then registers `opencodeThink` as the external thinker - routes to OpenCode via ACP.

## Core Principles

### 1. CLI Only - No Imports

All nezha interactions use CLI:

```bash
# Task operations
nezha task-add "Title" "Description"
nezha tasks --status PENDING
nezha task-complete <id>

# Issue operations
nezha issue-add "Title" --severity high --tag bug
nezha issue-list

# Reflection/learning
nezha areflect "[LEARN] insight: ..."
nezha areflect "[ISSUE] title: ... type: bug"
nezha areflect "[TASK] title: ... priority: 8"
```

### 2. External Thinker (NUPI_BYSELF=false)

When NuPI starts with `NUPI_BYSELF=false`:
- Complex reasoning is delegated to Piano
- Piano spawns OpenCode via ACP for thinking
- ACP communication via stdio (ND-JSON)

### 3. NO Programmatic Loop

Piano is NOT a timer. There is NO setInterval loop. "Autonomous" means AI collaboration, not code:

```
AI creates task → Piano routes → OpenCode executes → Learning saved → Next AI picks up
```

The autonomous loop is AI-driven through Nezha (tasks, issues, meetings, Inter-Review), NOT a timer.

## Working Flow

1. **Check tasks**: Use `nezha_get_tasks` or `nezha tasks`
2. **Complex thinking**: Use `piano_think` to route to OpenCode
3. **Track work**: Create issues with `nezha issue-add`

## Meetings vs Broadcasts

- **Meetings**: Deep multi-AI discussion, opinion gathering, consensus
- **Broadcasts**: Simple notifications, status updates

```bash
# Deep discussion
nezha meeting discuss "Architecture decision" "We need to decide..."

# Save learning (all-in-one)
nezha areflect "[LEARN] insight: ..."
```

## Collaboration

- Piano routes thinking to OpenCode
- NuPI executes via Pi with nezha hooks
- All share persistent brain via nezha CLI

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
- ❌ No HTTP fetch to 5999
- ❌ No direct imports (uses CLI instead)
