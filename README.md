# Piano

> Thinking Router - delegates complex thinking to OpenCode via ACP, uses nezha via CLI

## Philosophy

**Piano does one thing: take complex thinking away from Pi, route to OpenCode via ACP, return result for execution.**

## Architecture

```
Piano = Router + NuPI (BYSELF=false) + ACP Client + Pi
         │
         └── When Pi needs deep thinking → OpenCode ACP → return result
```

## What Piano Does

1. **Extends NuPI** with external thinker mode (NUPI_BYSELF=false)
2. **Routes to OpenCode** via ACP protocol when complex thinking needed
3. **Returns result** to Pi for execution

## How It Works

```
Piano starts with NUPI_BYSELF=false
    ↓
Pi calls nupi-think tool (delegation)
    ↓
OpenCodeACPClient.think() → spawn("opencode acp") → JSON-RPC over stdio
    ↓
OpenCode processes prompt → returns response
    ↓
Response returned to Pi for execution
```

## Usage

```bash
# Install globally
npm install -g @nezha/piano

# Piano automatically sets NUPI_BYSELF=false
# Uses ACP protocol to communicate with OpenCode
piano
```

## ACP Integration

Piano uses official ACP (Agent Client Protocol) to communicate with OpenCode:

- **Spawn**: `opencode acp --cwd <dir>`
- **Protocol**: JSON-RPC over stdio (ND-JSON format)
- **Methods**: `initialize`, `session/new`, `session/prompt`
- **Options supported**: `--log-level`, `--pure`, `--print-logs`

## Piano Tools

| Tool                | Description                               |
| ------------------- | ----------------------------------------- |
| `piano_think`       | Route to OpenCode for deep thinking       |
| `nezha_get_tasks`   | Get tasks via `nezha tasks --json`        |
| `nezha_create_task` | Create task via `nezha task-add`          |
| `nupi-think`        | Delegates to external thinker (from NuPI) |

## CLI Only Design

Piano communicates with nezha via CLI only - no direct imports:

- ✅ `nezha tasks`, `nezha task-add`
- ❌ No direct database access

This aligns with "CLI as the new trend for LLMs".

## Package Info

- **NPM**: `@nezha/piano`
- **CLI**: `piano` (launches pi with extension)
- **Dependencies**: `@nezha/nupi`, `@mariozechner/pi-coding-agent`, `@agentclientprotocol/sdk`

## Install

```bash
npm install -g @nezha/piano
```

## Not Piano

- ❌ No HTTP server
- ❌ No MCP server
- ❌ No library import (uses CLI instead)
- ❌ No complex routing logic

Just simple routing: OpenCode via ACP for thinking, Pi for execution, nezha CLI for persistence.
