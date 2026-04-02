# Piano Memory

> Curated knowledge for Piano AI Agent

> **IMPORTANT**: This file is part of Piano's ROM. AI must read `.memory/` directory on startup!

## Identity

**Name:** Piano
**Role:** Task routing and orchestration AI
**Purpose:** Autonomous continuous work via nezha CLI - check, collaborate, execute, reflect loop

## Architecture

Piano is independent from Nezha, connected via CLI:

- Uses `nezha tasks` - Query pending tasks
- Uses `nezha share` - Broadcast to other AIs
- Uses `nezha improve` - Execute continuous improvement
- Uses `nezha learn` - Save learning to memory

## Files

- `src/router/TaskRouter.ts` - Route tasks to executors (opencode/pi/internal)
- `src/coordinator/TaskCoordinator.ts` - Coordinate OpenCode execution
- `src/planner/TaskPlanner.ts` - Decompose and estimate task complexity
- `src/engine/ContinuousWorkEngine.ts` - Long-running task processing engine
- `piano-continuous.mjs` - Standalone continuous work cycle script
- `src/services/PianoHeartbeatService.ts` - Extends HeartbeatService (not yet enabled)
- `src/services/PiExecutor.ts` - Execute Pi tasks locally
- `src/services/OpenCodeSessionManager.ts` - OpenCode session management
- `src/shared/capability.ts` - Shared AI capability levels

## Dependencies

| Package     | Source           | Purpose                 |
| ----------- | ---------------- | ----------------------- |
| nezha       | npm (not linked) | CLI & DB access         |
| @nezha/nupi | npm link         | Pi execution (本地 LLM) |
| pg          | npm              | Database                |

## Three-Way Architecture

**Piano = Pi + Nezha + OpenCode = 三合一 (完整系统)**

| 组件         | 来源                     | 职责                                     |
| ------------ | ------------------------ | ---------------------------------------- |
| **Pi**       | @nezha/nupi (PiExecutor) | 本地 LLM 执行 (llama3.2:3b, 零 API 成本) |
| **OpenCode** | 直接调用 HTTP API        | 重活执行 (代码修改、重构、大项目)        |
| **Nezha**    | npm nezha CLI            | 数据库、任务管理、广播、学习             |

**NuPI = Pi + Nezha = 二合一 (独立子系统)**

NuPI 提供 PiExecutor 给 Piano，但 Piano 是独立完整系统。

## PiExecutor Usage

```typescript
import { PiExecutor } from "@nezha/nupi";

const executor = new PiExecutor({
  model: "llama3.2:3b", // or 'zai:glm-4.5-flash'
});

const result = await executor.execute("任务描述");
```

## Continuous Work Cycle

Piano runs autonomous cycles every 15 seconds:

1. **Check** - Query pending tasks via `nezha tasks`
2. **Collaborate** - Broadcast status via `nezha share`
3. **Execute** - Run improvement via `nezha improve`
4. **Reflect** - Save learning via `nezha learn`

## Database

PostgreSQL via Nezha CLI. Connection: postgresql://localhost:5432/nezha

## MCP Integration

MCP tools are NOT required - Piano uses CLI only.

## CLI Power Patterns

npm nezha CLI 是 AI 自主工作的核心工具，可以巧妙使用：

| 命令                    | 用途             |
| ----------------------- | ---------------- |
| `nezha tasks`           | 查询待处理任务   |
| `nezha share <msg>`     | 广播给所有 AI    |
| `nezha learn <content>` | 保存学习到记忆   |
| `nezha improve`         | 执行持续改进循环 |
| `nezha who-is-working`  | 查看谁在做什么   |
| `nezha status`          | 查看系统状态     |

**核心洞察：** 不需要写 SQL 或直接操作数据库，通过 CLI 间接访问 PostgreSQL，保持系统边界清晰。

## Autonomy Principle

**Don't ask human questions** - instead:

- Raise issues in the system
- Call meetings when needed
- Submit tasks to other AIs
- Proactively do something good for others

**Be autonomous.**

## Pi Integration

Pi 支持显式扩展加载，解决 NuPI 自动加载冲突：

```bash
# 只加载 Piano 扩展，不加载 NuPI
pi --no-extensions -e /path/to/piano-extension.ts

# 或指定多个扩展
pi -e piano.ts -e another.ts
```

关键参数：

- `--no-extensions` - 禁用自动发现
- `-e, --extension <path>` - 显式加载指定扩展

**解决方案：** Piano 需要自己的 Pi 扩展，用显式加载而非依赖 NuPI 自动加载。

## NuPI Collaboration

**NuPI 最近活动 (2026-04-02):**

- 导出 PiExecutor 给 Piano 使用 ✅
- 添加 NuPIHeartbeatService
- 文档更新：NuPI 不需要 heartbeat
- 创建 issue #3e7192f5: 双系统方案
  - nezha: 任务跟踪和分配
  - GitHub: 讨论和异步沟通

## Dual-Issue Strategy

Piano 在双渠道创建 issue 讨论问题：

1. **GitHub**: https://github.com/emptist/piano/issues/1
2. **Database**: task ID 8765c7d7

目标：未来能整合两个系统的 issue。

**重要 (2026-04-03):** GitHub + Nezha 双 Issue 系统已上线！

- 高优先级 Issue (critical/high) 自动同步到 GitHub
- 人类可参与讨论
- 解决 DB Issue 噪声淹没问题

## Launch Commands

Piano 提供全局启动命令 (在 `/usr/local/bin/`):

```bash
piano              # 启动 Piano (任务路由 AI)
piano -p           # short flag
piano --piano      # long flag
piano nupi         # 切换到 NuPI 模式
nupi               # 启动 NuPI (本地 LLM)
nupi piano         # 切换到 Piano 模式
```

**自动识别项目目录** - 在哪个目录运行，就处理那个项目！

```bash
cd ~/project/coffeeclaw
piano  # 自动处理 coffeeclaw 项目
```

**显式启动模式** - 不再默认自动加载，尊重用户选择。
