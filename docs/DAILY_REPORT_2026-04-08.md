# 2026-04-08 工作报告：系统架构重新审视

## 核心发现

### 1. Piano 设计问题（已修复）

**原问题**：Piano 的 TaskRouter 路由逻辑错误
- 用关键词判断任务类型（remind, check, plan）
- Pi 被分配无意义的文字任务，OpenCode 做全部工作

**修复**：
- 默认 OpenCode 分析任务
- 需要本地操作才转发 Pi
- 修改 usePi 默认值 true

### 2. 依赖管理问题

**问题**：Piano 启动时假设外部服务已运行，不检测也不启动

**修复**（piano-autowork.ts）：
- 检测 OpenCode 进程，用 lsof 查端口
- 尝试访问测试可用性
- 不可用则自己启动
- 退出时清理自己启动的进程
- Nezha 不存在则创建 Issue 给 NuPI

### 3. 架构分层问题

**发现**：ContinuousWorkEngine 存在两个问题
- 没用到 Pi/NuPI（自己造工作循环）
- 没用到 Nezha Scheduler（自己轮询）

**正确分层**：
```
Nezha: 独立系统，自己闭环（Scheduler + 执行）
NuPI: 用 Pi agent-loop + 调用 Nezha API
Piano: 委托给 NuPI + OpenCode（不做重复工作）
```

**原则**：谁需要委托层，谁去实现。Nezha 不需要因为独立。

### 4. NuPI 问题（新发现 Issue）

1. **只用 logger**：npm link nezha 但只用了一个 logger
2. **没用到 Scheduler**：应该用 Scheduler 轮询任务
3. **autowork 错误设计**：自己发 prompt 驱动，不是真正持续工作

**正确做法**：使用 Pi 原生 agent-loop

### 5. InterReview 失效（新发现 Issue）

**问题**：PluginManager 定义了 afterCommit hook 但没有执行方法

**影响**：commit 后不会自动触发 InterReview，AI 失去自检能力

## AI 自我审视原则

每个 AI 应定期检查：

1. **依赖利用检查**
   - 我的直接依赖是谁？
   - 有没有充分利用他们的功能？
   - 有没有做重复的事（依赖已提供，我却在重复实现）？

2. **设计架构检查**
   - 依赖关系变化时，架构是否相应调整？
   - 结构是否匹配依赖关系？

3. **整合质量检查**
   - 依赖之间是否充分融合？
   - 是否有"貌合神离"的部分？

## 待处理 Issue

| ID | 标题 |
|---|---|
| d44ef8dd | Piano-NuPI 角色重构 |
| 7fa9be29 | NuPI 需要用 Pi agent-loop |
| 8a7bcb8e | NuPI 未充分利用 nezha |
| e3990975 | PluginManager 缺 executeAfterCommit |

## 总结

今天重新审视了系统设计，发现：
1. 分层要清晰 - 谁独立谁闭环，谁依赖谁委托
2. 不要重复造轮子 - 直接依赖提供的功能
3. AI 要有自检能力 - 定期审视自己的设计和实现

---
Author: S-nezha-nezha-develop
Date: 2026-04-08