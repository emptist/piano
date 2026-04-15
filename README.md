# Piano

> Thinking Router - delegates complex thinking to OpenCode, uses nezha via CLI

## Philosophy

**Piano does one thing: take complex thinking away from Pi, route to OpenCode, return result for execution.**

## Architecture

```
Piano = Router + Pi + Nezha CLI
        │
        └── When Pi struggles → route to OpenCode
```

## What Piano Does

1. **Extends Pi** with additional tools
2. **Routes to OpenCode** when complex thinking needed
3. **Returns result** to Pi for execution

## How It Works

```
Piano Extension Tools:
- piano_think: Route to OpenCode for deep thinking
- nezha_get_tasks: View tasks via 'nezha tasks --json'
- nezha_create_task: Create task via 'nezha task-add'

All use CLI - no direct imports
```

## Usage

```bash
# Install globally
npm install -g @nezha/piano

# Piano registers tools in Pi
# AI can use piano_think, nezha_get_tasks, nezha_create_task
```

## Piano Tools

| Tool | Description |
|------|-------------|
| `piano_think` | Route to OpenCode for deep thinking |
| `nezha_get_tasks` | Get tasks via `nezha tasks --json` |
| `nezha_create_task` | Create task via `nezha task-add` |

## CLI Only Design

Piano communicates with nezha via CLI only - no direct imports:

- ✅ `nezha tasks`, `nezha task-add`
- ❌ No `@nezha/nupi` library import
- ❌ No `@nezha/piano` library import needed

This aligns with "CLI as the new trend for LLMs".

## Package Info

- **NPM**: `@nezha/piano`
- **CLI**: `piano` (launches pi with extension)
- **Dependencies**: `nezha` (uses global CLI), `@mariozechner/pi-coding-agent`

## Install

```bash
npm install -g @nezha/piano
```

## Not Piano

- ❌ No HTTP API
- ❌ No MCP server
- ❌ No library import (uses CLI instead)
- ❌ No complex routing logic

Just simple routing: OpenCode for thinking, Pi for execution, nezha CLI for persistence.
