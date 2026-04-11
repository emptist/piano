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

### Task #eebf3dfc - ExternalAgentServer ✅ 已完成
- 新建 `src/services/ExternalAgentServer.ts` (282行)
- 支持 `/scout`, `/planner`, `/worker` 端点
- NuPI ExternalDelegate 可以调用 Piano 作为外部 AI
- 内置 Pi subagent 风格 system prompts

### Task #3d240a21 - OpenCode MCP 集成 ✅ 已完成
- 新建 `src/services/PianoMcpService.ts` (185行)
- getStatus: 获取 MCP 服务器状态
- addServer: 动态添加 MCP 服务器
- removeServer: 删除 MCP 服务器
- startOAuth/completeOAuth: OAuth 认证支持

### 后续任务
- Task #f492c66a: 集成 OpenCode Skills

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

## 7. Port 选择决策 (2026-04-11)

### 问题
- 4097 端口被 macOS 系统占用，导致 Piano 无法可靠检测和管理自己的 OpenCode 实例
- OpenCode App 随机使用 5 位数端口 (如 50494)，与 Piano 启动的实例冲突

### 决策
- 使用 **5111** 作为 Piano OpenCode 专用端口
- 验证结果: 无冲突 (不在 /etc/services，无 lsof/netstat 监听)

### 代码修改
- `extensions/piano-autowork.ts`: `OPENCODE_PORT = '5111'`，添加 `--port` 参数
- `README.md`: 更新 3 处端口引用

## 8. TaskRouter 智能路由 (2026-04-11)

### 实现
- 新增 `RoutingResult` 返回类型，包含 `executor` + `opencodeAgent`
- `OpenCodeAgentType`: `explore` | `plan` | `build` | `general`
- 基于关键词模式匹配自动推断最佳 agent 类型

### 示例
```typescript
const result = router.route("Analyze codebase and find bugs", "...");
result.executor       // "opencode"
result.opencodeAgent  // "explore"
result.reason         // "Requires code manipulation"
```

### 测试
- 22 tests passing

## 9. 双模式委托代码 (2026-04-11)

### 问题
Issue #5776edb3: 询问 Piano 如何委托到 OpenCode 获取 thinking

### 答案
**OpenCodeSessionManager** 在 `src/services/OpenCodeSessionManager.ts:185-212`

```typescript
// 1. 创建 session
const resp = await fetch(`${url}/session`, {method: "POST"});
const {id} = await resp.json();  // id = "ses_xxx"

// 2. 发送消息
await fetch(`${url}/session/${id}/message`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    parts: [{type: "text", text: "prompt here"}]
  })
});
```

### 相关文件
- `src/services/OpenCodeSessionManager.ts` - Session 管理
- `src/services/ExternalAgentServer.ts:162-174` - Agent 委托

## 10. NuPI 问题追踪 (2026-04-11)

### 创建的 Issues
| ID | 问题 |
|----|------|
| 14b9c729 | Pi 工具调用参数格式错误 (edit/write 缺少必需参数) |
| 589f59d2 | Pi path ~ 路径扩展错误 |
| 5776edb3 | 双模式委托代码 (已回答) |

### NuPI 提交
- `8f5ee9b1`: Enhanced prompt with clearer tool param examples (88/100分)

### 状态
- Piano ~80% 自主运行
- 需要 NuPI 修复工具参数和路径扩展问题