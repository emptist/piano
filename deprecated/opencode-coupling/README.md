# OpenCode 耦合移除

## 概述

这个目录包含从 Nezha 移除的、与 OpenCode 强耦合的代码。

## 移除原因

经过深度追踪分析，发现 **OpenCode 对 Nezha 是完全多余的**。

### OpenCode 提供的三类能力

| 能力     | OpenCode 实现   | Nezha 等价实现                  | 结论      |
| -------- | --------------- | ------------------------------- | --------- |
| LLM 调用 | REST API        | `AIProvider` (OpenAI/Anthropic) | ✅ 已有   |
| 会话管理 | Session/Context | 不需要（任务独立）              | ❌ 不需要 |
| Tools    | 文件/命令执行   | `fs`/`child_process`            | ✅ 已有   |

### 错误扩散路径

```
UnifiedAgent (错误设计: 封装 OpenCode API)
    │
    ├── HeartbeatService.executeTask()
    │   └── 调用 OpenCode 执行任务 ← 只需要 LLM
    │
    ├── InterReviewService.callAI()
    │   └── 调用 OpenCode 做代码审查 ← 已有 AIProvider fallback
    │
    └── MeetingHandler.handleDiscussionTask()
        └── 调用 OpenCode 生成观点 ← 只需要 LLM
```

### 核心洞察

1. **OpenCode 是给人类用的 CLI 工具**
   - 有 Tools（读文件、写文件、执行命令）供人使用
   - 有会话管理维持上下文

2. **Nezha 是任务调度器**
   - 直接操作数据库（DatabaseClient）
   - 直接操作文件系统（Node.js fs）
   - 直接执行命令（child_process）
   - **不需要会话管理**（每次任务独立，通过 DB 共享）

3. **唯一需要的是 LLM 调用**
   - `AIProvider` 已经提供 OpenAI/Anthropic API 调用
   - `InterReviewService` 已经在用 AIProvider 作为 fallback

### 任务内容分析

从 `Continuous Improvement Cycle` 任务看：

- "Review recent commits" - 只需要 LLM 分析能力
- "Create improvement tasks" - 只需要 LLM 生成能力
- **不需要 AI 修改代码**（那是人类的职责）

### 结论

OpenCode 的所有能力 Nezha 都有等价替代，且 Nezha 根本不需要 OpenCode 提供的会话管理和 Tools。

## 包含的文件

| 文件                       | 说明                                      |
| -------------------------- | ----------------------------------------- |
| `Agent.ts`                 | 封装 OpenCode HTTP API 的 Agent 类        |
| `UnifiedAgent.ts`          | 统一 Agent（封装 OpenCode + 重试/熔断等） |
| `OpenCodeClient.ts`        | OpenCode CLI 客户端                       |
| `transports/index.ts`      | HttpTransport, CliTransport               |
| `TransportBenchmark.ts`    | 性能测试                                  |
| `UnifiedAgentBenchmark.ts` | 性能测试                                  |

## 影响范围

需要修改的文件（使用 OpenCode 但不包含在此目录）：

| 文件                                 | 修改方案                                |
| ------------------------------------ | --------------------------------------- |
| `src/services/HeartbeatService.ts`   | 用 AIProvider 替代 UnifiedAgent         |
| `src/services/InterReviewService.ts` | 删除 UnifiedAgent 分支，只用 AIProvider |
| `src/services/MeetingHandler.ts`     | 用 AIProvider 替代 UnifiedAgent         |
| `src/cli/index.ts`                   | 删除 serverUrl 配置                     |
| `src/daemon/index.ts`                | 删除 serverUrl 配置                     |
| `src/services/HealthServer.ts`       | 删除 opencodeApiUrl 端点                |
| `src/config/Config.ts`               | 删除 OpenCode 相关配置                  |

## 验证方法

1. 确保 `AIProvider` 工作正常（已有 fallback 机制）
2. 跑测试验证功能不受影响
3. 删除此目录

## 时间线

- 2026-03-25: 完成深度追踪分析
