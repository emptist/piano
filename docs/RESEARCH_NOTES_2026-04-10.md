# Piano Research Notes - 2026-04-10

## 1. Pi Subagent 机制研究

### 核心发现
- **隔离上下文**: 每个子代理运行在独立 `pi` 进程
- **流式输出**: 实时看到工具调用和进度
- **并行执行**: 最多8个任务, 4个并发
- **Chain模式**: 顺序执行，用 `{previous}` 占位符传递前一个输出

### 内置4个Agent
| Agent | 用途 | 模型 | 工具 |
|-------|------|------|------|
| scout | 快速代码库侦察 | haiku | read,grep,find,ls,bash |
| planner | 创建实现计划 | sonnet | read,grep,find,ls |
| reviewer | 代码审查 | sonnet | read,grep,find,ls,bash |
| worker | 通用任务 | sonnet | (全部默认) |

### Chain工作流
- `/implement` = scout → planner → worker
- `/scout-and-plan` = scout → planner
- `/implement-and-review` = worker → reviewer → worker

### Agent定义格式
```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-sonnet-4-5
---

System prompt for the agent goes here.
```

## 2. OpenCode 能力研究

### MCP 系统
- 动态添加/删除 MCP 服务器 (`POST /mcp`)
- OAuth 认证支持
- 状态监控 API (`GET /mcp`)
- 位置: `src/server/routes/mcp.ts`

### Skills 系统
- 从 `index.json` 远程拉取 skill 定义
- `/skill <name>` 加载技能到对话上下文
- 支持远程 URL 安装
- 位置: `src/skill/discovery.ts`

### 内置工具
- read, grep, find, ls, bash
- edit, multiedit
- websearch, webfetch
- codesearch
- todo, task, plan

### Session 管理
- 自动压缩 (compaction)
- 恢复机制
- 重试机制

## 3. NuPI 双模式设计

### 模式1: 独立模式 (Standalone)
- NuPI 自主工作
- 本地 Pi + PostgreSQL
- 不依赖外部 AI

### 模式2: 外挂模式 (External)
- 通过 Pi subagent 机制
- 将思考交付外部 AI (Piano/OpenCode)
- 支持 Single/Parallel/Chain 模式

### ExternalDelegate (Phase 3 基础)
```typescript
// 类型: src/types/external.ts
- WorkMode: 'standalone' | 'external'
- ExternalAgentConfig: { name, url, tools?, model? }
- ChainStep: { agent, task, cwd? }
- DelegateOptions: { mode, agent, task, tasks, chain }

// 服务: src/services/ExternalDelegate.ts
- registerAgent(), getAgent(), hasAgent()
- singleDelegate(), parallelDelegate(), chainDelegate()
- {previous} 占位符支持
- MAX_CONCURRENT = 4
```

## 4. Piano 改进

### Task #9c56858c - HTTP API 集成 ✅ 已完成
- 用 `@nezha/nupi` 的 `getNuPIClient()` 替换 `execSync` CLI spawn
- 修改文件:
  - `extensions/shared.ts`: 添加 HTTP 客户端和命令路由
  - `extensions/piano-infra.ts`: 改为 async handlers
  - `extensions/piano-tools.ts`: 改为 async handlers

### 后续任务
- Task #3d240a21: 集成 OpenCode MCP
- Task #f492c66a: 集成 OpenCode Skills
- Task #eebf3dfc: 接入 Pi Subagent 外挂模式

## 5. 设计原则

### 核心原则
- Piano 几乎所有"用脑子"的事情由 OpenCode 做
- NuPI 免费模型太弱，需要外挂 OpenCode
- 用户运行 Piano = 要用 OpenCode 思考
- 不需要复杂任务分配，几乎全部给 OpenCode

### 依赖链
```
Nezha → NuPI → Piano → OpenCode
   ↓       ↓        ↓
  基础    基础     关键桥梁
```

### 互补关系
- NuPI = 铅笔 (轻量简单)
- Piano = 钢笔 (强大复杂)
- 各有不同的使用场景，没有竞争，只有互补

## 6. 研究来源
- `../refers/pi-mono/packages/coding-agent/examples/extensions/subagent/`
- `../refers/opencode/packages/opencode/src/`
- `nupi/docs/DUAL_WORK_MODE.md`