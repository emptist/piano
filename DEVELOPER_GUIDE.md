# Piano Developer Guide

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (nezha database)
- npm link to nezha: `npm link nezha`

### Setup

```bash
# Install dependencies
npm install

# Link nezha
npm link nezha

# Build
npm run build
```

### Development Workflow

1. Make changes in piano
2. Test with `npm run typecheck`
3. Commit (hook will add agent ID)
4. Push to remote

### Architecture

Piano extends Nezha HeartbeatService with task routing capabilities.

### Key Files

- `src/router/TaskRouter.ts` - Route tasks
- `src/coordinator/TaskCoordinator.ts` - Coordinate OpenCode
- `src/services/PianoHeartbeatService.ts` - Main service

### Testing

```bash
npm run test
```

### Building

```bash
npm run build
```

Note: After modifying nezha core, run `npm run build` in nezha to update the linked package.
