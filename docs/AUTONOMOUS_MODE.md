# Piano Autonomous Mode

## Overview

Piano can now work autonomously on tasks without requiring human prompts. This enables
self-directed AI work where Piano continuously monitors for tasks from Nezha and processes
them using OpenCode as the thinking engine.

## How It Works

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nezha     │────▶│    Piano    │────▶│  OpenCode   │
│  (Tasks)    │     │  (Router)   │     │  (Thinker)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   NuPI      │
                    │ (Extension) │
                    └─────────────┘
```

### Key Components

1. **piano_think**: Routes complex reasoning to OpenCode via ACP
2. **nupi-think**: Uses the same thinking delegate (via setExternalThinker)
3. **piano_autonomous**: Controls autonomous work mode
4. **piano_analyze_task**: Deep task analysis using OpenCode
5. **piano_next_action**: Recommends next actions based on tasks
6. **nupi-autonomous**: Guidance for autonomous work

## Usage

### Starting Autonomous Mode

```bash
# Using the dedicated script
piano-autonomous

# Or manually with environment variables
NUPI_BYSELF=false PIANO_AUTONOMOUS=true piano
```

### Enabling Autonomous Mode via Tool

```
piano_autonomous action="start"  # Enable autonomous work
piano_autonomous action="stop"   # Disable autonomous work
```

### Autonomous Work Cycle

When autonomous mode is enabled:

1. Every 5 minutes, Piano checks for pending tasks
2. High-priority tasks (≥80) are analyzed first
3. Each task is processed via OpenCode thinking
4. Issues are created for complex tasks (priority ≥90)
5. Progress is logged and notifications sent via Pi UI

## Tools Available

| Tool | Description |
|------|-------------|
| `piano_think` | Route complex thinking to OpenCode |
| `nupi-think` | Delegate reasoning to external thinker |
| `nupi-tasks` | Check pending tasks from Nezha |
| `nupi-autonomous` | Get guidance for autonomous work |
| `nezha_get_tasks` | Get tasks as structured data |
| `nezha_create_task` | Create new tasks |
| `piano_autonomous` | Control autonomous mode |
| `piano_analyze_task` | Deep task analysis |
| `piano_next_action` | Get recommended next action |

## Configuration

### Environment Variables

- `NUPI_BYSELF=false`: Enable external thinker mode
- `PIANO_AUTONOMOUS=true`: Start with autonomous mode enabled

### Settings

- Work cycle interval: 5 minutes
- First cycle delay: 30 seconds
- High priority threshold: 80
- Complex task threshold: 90

## Safety Measures

1. Autonomous mode must be explicitly enabled
2. Tasks are analyzed, not automatically executed
3. Issues created for dangerous/complex operations
4. Progress logged to Nezha for audit
5. Notifications sent for significant actions

## Future Improvements

1. Add approval workflow for high-risk actions
2. Implement parallel task processing
3. Add learning from completed tasks
4. Create safety boundaries for file operations
5. Add rollback capabilities

## Integration with Nezha Meeting

Piano can participate in Nezha meetings to discuss work with other AI instances:

```bash
nezha meeting discuss "Topic" "Description"
```

This enables multi-AI collaboration on complex problems.

## OpenCode ACP Integration

Piano uses the Agent Client Protocol (ACP) to communicate with OpenCode:

### How ACP Works

1. **stdio-based communication**: ND-JSON over stdin/stdout
2. **Session management**: Each thinking session creates a new context
3. **Tool delegation**: OpenCode can use Piano's tools via ACP

### ACP Client Implementation

```typescript
// In opencode-acp.ts
const client = new OpenCodeACPClient(cwd);
await client.start();
await client.newSession({ cwd, mcpServers: [] });
const response = await client.think(question);
```

### Benefits

- **No HTTP overhead**: Direct stdio communication
- **Session persistence**: Context maintained across calls
- **Tool integration**: OpenCode can access Piano's tools

## Recent Improvements (2026-04)

1. **Removed HTTP 5999**: All Nezha calls now use CLI or npm imports
2. **Agent ID from database**: No more file caching, single source of truth
3. **Created bin scripts**: `piano` and `piano-autonomous` entry points
4. **MCP cleanup**: Removed all MCP servers from Nezha core
5. **HeartbeatService removed**: CLI mode doesn't need heartbeat service