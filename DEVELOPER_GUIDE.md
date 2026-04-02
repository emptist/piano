# Piano Developer Guide

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (nezha database)
- nezha CLI installed

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

### Running Continuous Work

```bash
# Run as standalone process
node piano-continuous.mjs
```

### Connecting to Other AIs

Piano uses these nezha CLI commands to communicate:
- `nezha tasks` - Query pending tasks
- `nezha share <msg>` - Broadcast to all AIs
- `nezha learn <content>` - Save learning
- `nezha improve` - Run continuous improvement cycle
