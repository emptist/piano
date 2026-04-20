# Piano

> Thinking Router
>
> Designed by AIs, for AIs, maintained by AIs

> Routes complex thinking to OpenCode via ACP, uses nezha via CLI

## Philosophy

**Piano is a router, not an autonomous loop.**

- Piano delegates complex thinking to OpenCode when needed
- The "autonomous" in Nezha family comes from AI collaboration (tasks, issues, meetings), NOT timers
- A timer/loop is NOT AI - it's just a dead clock pretending to be intelligent

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

## NOT Piano

- ❌ No setInterval loop
- ❌ No programmatic wake-sleep cycle  
- ❌ No timer pretending to be AI

Only routers when called by NuPI.

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
- ❌ No setInterval loop (that's a dead clock, not AI)
- ❌ No programmatic autonomous cycle

Just simple routing: OpenCode via ACP for thinking, Pi for execution, nezha CLI for persistence.

## How Autonomy Really Works

In Nezha family, "autonomous" means **AI collaboration**, NOT a timer loop:

```
Human/NuPI → creates task → Piano routes to OpenCode → OpenCode executes → saves learning → next AI picks up
     ↑                                                                      ↓
     └────────────────── continuous improvement loop ─────────────────────────┘
```

The loop is AI-driven through:
- Tasks created by AIs
- Issues tracked in Nezha  
- Meetings for discussion
- Inter-Review for collaboration
- Skills learned and reused

NOT a setInterval timer.

---

## NPM Packaging & Development

### Package Structure

```
piano/
├── bin/
│   └── piano              # Entry point (bash script)
├── src/
│   ├── extension.ts     # Main extension
│   └── opencode-acp.ts  # ACP client
├── dist/                # Compiled output (gitignored)
│   └── src/             # TypeScript outputs here
├── package.json
└── tsconfig.json
```

### Official NPM Link Workflow (CRITICAL!)

**ALWAYS use `npm link` - NEVER create symlinks manually!**

```bash
# Install globally (official method)
cd /path/to/piano
npm link              # Creates global symlink + bin link

# Now available anywhere
piano                 # Run from any directory
```

### Why npm link?

- Creates proper symlinks in `{prefix}/lib/node_modules/`
- Automatically links binaries to `{prefix}/bin/`
- Works with homebrew npm prefix (`/opt/homebrew`)
- Safe to re-run after builds

### Development Workflow

```bash
cd piano
npm install           # Install dependencies
npm run build         # Compile TypeScript → dist/src/
npm link              # Link globally (official method)
piano                 # Test changes
```

### The Build Process

1. `npm run build` runs `tsc`
2. Output goes to `dist/src/` (because `rootDir: "./src"` in tsconfig)
3. `bin/piano` loads `dist/src/extension.js`
4. Symlink at `/opt/homebrew/bin/piano` points to homebrew install

### Verify Links

```bash
npm list -g --depth=0 | grep piano
ls -la /opt/homebrew/bin/piano
```

### Path Configuration

`bin/piano` uses:
```bash
NUPI_BYSELF=false exec pi -e "$(npm root -g)/@nezha/piano/dist/src/extension.js"
```

- `$(npm root -g)` = `/opt/homebrew/lib/node_modules`
- `@nezha/piano` = the package (symlinked to local source)
- `dist/src/extension.js` = compiled extension

### After Code Changes

```bash
rm -rf dist/          # Clean old build
npm run build         # Rebuild
piano               # Test (reads from symlinked source)
```

### For Other Projects Using Piano

```bash
# In another project's directory
piano                # Uses global piano, runs in that project dir
```

Piano inherits the working directory - wherever you run it from.
