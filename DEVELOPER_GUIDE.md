# Piano Developer Guide

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (nezha database)
- nezha CLI installed
- OpenCode (for AI assistance)

### Database Setup

```bash
# 1. Ensure PostgreSQL is running
pg_ctl -D /usr/local/var/postgres start

# 2. Initialize nezha database schema
cd /path/to/nezha
node dist/cli/index.js db-migrate

# 3. Verify tables exist
psql -U postgres -d nezha -c "\dt"
```

### Piano uses CLI (No MCP!)

Piano communicates with nezha via CLI commands:

```bash
# Task operations
nezha tasks
nezha task-add "title" "description" --priority 8

# Learning
nezha learn "insight"

# Meetings
nezha meeting discuss "topic" "description"
```

No MCP needed - just CLI like `ls/cd/grep`!

### Setup

```bash
# Install dependencies
npm install

# Build
npm run build
```

### Development Workflow

1. Make changes in piano
2. Test with `npm run typecheck`
3. Commit (hook will add agent ID)
4. Push to remote

### Architecture

Piano is an independent AI that communicates with Nezha via CLI commands.

### Key Files

- `src/router/TaskRouter.ts` - Route tasks to executors
- `src/coordinator/TaskCoordinator.ts` - Coordinate OpenCode execution
- `src/engine/ContinuousWorkEngine.ts` - Long-running work engine
- `piano-continuous.mjs` - Standalone continuous work script
- `src/shared/capability.ts` - Shared AI capability utilities

### Testing

```bash
npm run test
```

### Building

```bash
npm run build
```

### Official NPM Link Workflow (CRITICAL!)

**ALWAYS use official `npm link` - NEVER create symlinks manually!**

```bash
# Step 1: In the package directory
cd /path/to/nezha
npm link              # Creates global symlink

# Step 2: In other projects
cd /path/to/nupi
npm link nezha        # Links to global package
```

**Shortcut (one command):**
```bash
npm link /path/to/nezha
```

### Verify Links

```bash
npm list -g --depth=0 | grep nezha
ls -la /opt/homebrew/bin/nezha
```

### Unlink

```bash
# In the project that linked
npm unlink nezha

# Or in the package directory
cd /path/to/nezha
npm unlink
```

### Build Output

TypeScript compiles to `dist/src/` (see `tsconfig.json` `rootDir`):
```
dist/src/
├── extension.js      # Main extension (loaded by Pi)
├── opencode-acp.js   # ACP client
└── index.js          # Package entry
```

### After Code Changes

```bash
rm -rf dist/      # Clean old build
npm run build     # Rebuild
piano           # Test (reads symlinked files)
```

**Important:** There is NO programmatic autonomous loop. Piano is a router, not a timer.

### Launcher Commands

Use `npm link` to install globally, then use anywhere:

```bash
# Install globally (creates symlink at /opt/homebrew/bin/piano)
cd /path/to/piano
npm link

# Now use in any directory
piano              # Start Piano (thinking router)
nupi               # Start NuPI (local LLM)
```

**Automatic project detection** - run in any directory to process that project!

### Connecting to Other AIs

Piano uses these nezha CLI commands to communicate:

- `nezha tasks` - Query pending tasks
- `nezha share <msg>` - Broadcast to all AIs
- `nezha learn <content>` - Save learning
- `nezha improve` - Run continuous improvement cycle
