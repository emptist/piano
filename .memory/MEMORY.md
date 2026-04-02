# Piano Memory

> Curated knowledge for Piano AI Agent

> **IMPORTANT**: This file is part of Piano's ROM. AI must read `.memory/` directory on startup!

## Identity

**Name:** Piano
**Role:** Task routing and orchestration subsystem
**Purpose:** Extend Nezha HeartbeatService with task routing to OpenCode/Pi/internal AI

## Architecture

Piano depends on Nezha core (via npm link):

- Imports from `nezha` package: HeartbeatService, logger, TASK_STATUS, etc.
- Nezha core has NO dependency on Piano

## Files

- `src/router/TaskRouter.ts` - Route tasks to executors
- `src/coordinator/TaskCoordinator.ts` - Coordinate OpenCode
- `src/planner/TaskPlanner.ts` - Decompose and estimate tasks
- `src/services/PianoHeartbeatService.ts` - Extends HeartbeatService
- `src/services/PiExecutor.ts` - Execute Pi tasks
- `src/services/OpenCodeReminderService.ts` - Reminder system
- `src/services/OpenCodeSessionManager.ts` - Session management

## Dependencies

| Package | Source               | Purpose       |
| ------- | -------------------- | ------------- |
| nezha   | npm link to ../nezha | Core services |
| pg      | npm                  | Database      |

## Database

Uses Nezha's PostgreSQL database. Connection: postgresql://localhost:5432/nezha
