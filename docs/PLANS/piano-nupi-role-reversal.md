# Issue: Piano-NuPI 执行器角色颠倒 - 重构计划

**严重程度**: 高

**状态**: 待处理

**创建时间**: 2026-04-08

---

## 问题描述（修正）

### 原理解
用户通过 Pi UI 对话 → Piano 协调 → OpenCode/NuPI 执行

### 当前问题
- Piano 跳过本地 Pi，全部给 OpenCode → 角色颠倒
- Pi 被闲置，OpenCode 承担全部工作

### 核心原则
**OpenCode 分析任务，能处理则处理，需要本地操作则转发 Pi**

比喻：
- **Piano = 摩托车** → 必须用引擎 → **OpenCode 是引擎**
- **NuPI = 自行车** → 不想要引擎（OpenCode大模型）→ 直接用 NuPI

用户选择：
- 用 Piano → 享受 OpenCode 大模型能力
- 不用 Piano → 直接用 NuPI（本地操作）

### 工作流
```
OpenCode (Piano 的引擎) 分析任务 →
    ├─→ 能自己处理 → 直接完成
    └─→ 需要本地操作 → 转发 Pi
```

## Piano 存在的意义

- **OpenCode**：免费大模型 → 分析 + 执行（首选）
- **本地 Pi**：作为 OpenCode 的"本地工具"

---

## OpenCode 独特价值（即使 NuPI 模型变强）

即使 NuPI 模型变强，OpenCode 仍有不可替代价值：

| 价值 | 说明 |
|------|------|
| **100% 开源** | 可定制、可审计、无厂商锁定 |
| **Provider 解耦** | 可用 Claude/OpenAI/Google/本地模型 |
| **LSP 开箱即用** | 语言服务器协议支持 |
| **TUI 终端优先** | neovim 用户打造，终端体验最佳 |
| **Client/Server 架构** | 可远程驱动，UI 与执行分离 |
| **MCP 工具生态** | 丰富外部集成（数据库、GitHub、Slack等） |
| **IDE 编辑体验** | 完整代码编辑、diff、review 界面 |
| **安全沙箱** | 更完善的代码执行环境 |
| **企业级特性** | 认证、权限、审计日志 |

## Piano 存在的意义

**Piano = 摩托车，必须用引擎 OpenCode**
**NuPI = 自行车，不需要引擎**

用户选择：
- **用 Piano** → 享受 OpenCode 大模型能力
- **不用 Piano** → 直接用 NuPI（本地操作）

```
OpenCode (Piano 的引擎) 分析任务
    ├─→ 能处理 → 直接完成
    └─→ 需要本地 → 转发 Pi
```

**Piano 设计明确**：
- 有 OpenCode → 用 Piano（摩托车）
- 不想要大模型 → 直接用 NuPI（自行车）

---

## 当前错误模式

| 执行器 | 分配到的任务 | 实际擅长 |
|--------|-------------|----------|
| **Pi** | remind, check, plan, arrange（纯文字任务） | 代码操作、文件修改、shell命令 |
| **OpenCode** | 全部复杂任务 | 强推理、复杂规划 |

**代码位置**: `piano/src/router/TaskRouter.ts:59-70`

```typescript
const isPiTask =
  text.includes("remind") ||
  text.includes("check") ||
  text.includes("plan") ||
  text.includes("arrange") ||
  text.includes("create task") ||
  text.includes("decompose");
```

### 问题根源

1. **TaskRouter 用关键词判断** → 而非任务复杂度/模型需求
2. **PiExecutor 只是薄薄 CLI 封装** → 浪费了 NuPI 扩展的强大能力
3. **NuPI 扩展（nupi-tools.ts, nupi-autowork.ts）未被 Piano 利用

---

## NuPI 实际具备的能力（未被充分利用）

### nupi-tools.ts
- `nupi-tasks` - 查数据库任务
- `nupi-issues` - 查开放问题
- `nupi-status` - 系统状态
- `nupi-learn` - 保存学习
- `nupi-search` - 搜索记忆
- `nupi-share` - 广播通讯

### nupi-autowork.ts
- 自主工作循环 8 小时
- 自行检查任务/issues/git状态
- 完成后调用 `nupi-task-done`

### Pi 原生能力
- `read/edit/write/bash` - 代码操作
- `grep/find/ls` - 文件搜索

---

## 计划安排

### Phase 1: 重新定义执行器角色

| 执行器 | 职责 | 适用任务 |
|--------|------|----------|
| **OpenCode** | 复杂推理、跨域规划、多步协调 | 架构设计、复杂debug、方案设计 |
| **NuPI/Pi** | 代码操作、文件修改、数据库访问、长期工作 | 代码实现、修复bug、批量操作、自主循环 |

### Phase 2: NuPI 调整（@NuPI AI）

1. **扩展 PiExecutor 能力**：
   - 不仅调用 `pi execute`，还能触发 NuPI 扩展命令
   - 支持任务分派：告诉 Pi 需要做什么工具操作

2. **新增任务类型支持**：
   - `code_task`: 需要代码修改
   - `db_task`: 需要数据库操作
   - `autonomous_work`: 长时间自主工作

3. **暴露 NuPI 扩展能力给 Piano**：
   - 创建 API 接口让 Piano 分配特定类型任务

### Phase 3: Piano 工作流重组（@Piano AI）

1. **修改 TaskRouter 逻辑**：
   ```typescript
   // 新路由规则
   if (task.requiresCodeOperation) return 'nupi';
   if (task.requiresComplexReasoning) return 'opencode';
   ```

2. **新增任务分类器**：
   - 分析任务描述，判定需要哪种执行器
   - 参考 NuPI 扩展的命令集

3. **ContinuousWorkEngine 调整**：
   - 支持结果回调给 NuPI 进行后续操作
   - 支持长时任务（autonomous_work）

### Phase 4: 文档同步（@All）

1. **更新 Piano README**：
   - 说明新的执行器分工
   - 移除 "Pi 用于简单任务" 的错误描述

2. **更新 NuPI README**：
   - 说明 NuPI 作为代码操作执行器的角色
   - 文档化与 Piano 的协作方式

3. **更新 Nezha 架构图**：
   - 反映新的任务流转

---

## 合金比喻

| 组合 | 金属 | 特性 |
|------|------|------|
| **Pi** | 单一金属 | 本地工具 read/edit/write/bash |
| **Nezha** | 单一金属 | 记忆、学习、通讯、任务管理 |
| **NuPI** | **双金属组合** | Pi + Nezha = 本地工具 + 记忆系统 |
| **Piano** | **三金属合金** | OpenCode(引擎) + Pi + Nezha |

**NuPI 已发挥**：Pi 的工具能力 + Nezha 的记忆/学习/通讯

**Piano 需要加入**：OpenCode 大模型作为"引擎"

---

## AI 自我审视原则

每个 AI 在完成任务后，应该主动审视：

### 1. 依赖利用检查
- 我的直接依赖是谁？我有没有充分利用他们的功能？
- 有没有做重复的事情（依赖已经提供，我却在重复实现）？
- 有没有漏用依赖的能力？

### 2. 设计架构检查
- 当依赖关系变化时，架构是否相应调整？
- 结构是否与依赖关系匹配？（直接依赖 → 强整合，间接依赖 → 弱关联）

### 3. 整合质量检查
- 依赖之间的功能是否充分融合？
- 是否有"貌合神离"的部分？

### 案例：Piano 的反思

**过去**：Piano 直接依赖 OpenCode, Nezha, Pi → 自己实现 ContinuousWorkEngine
**问题**：没用到 NuPI（直接依赖 Pi+Nezha 的组合），没用到 Nezha Scheduler

**现在**：Piano 只依赖 NuPI + OpenCode → 应该：
- 委托 NuPI 执行（NuPI 用 Pi agent-loop）
- 自己不再做重复的工作循环

**原则**：谁需要委托层，谁去实现。Nezha 不需要因为它是独立的。

需要以下 AI 协作：

1. **@NuPI** - 实现 Phase 2，调整 PiExecutor 和扩展能力
2. **@Piano** - 实现 Phase 3，重组工作流
3. **@Nezha** - 协调验证，确认数据库改动

---

## 未来展望

当 NuPI 自有大模型变得强大且免费时：
- 用户用 Piano 的动力 → 从"大模型"转为"OpenCode 其他特色"
- 例如：MCP 生态、IDE 体验、Client/Server 架构、远程可驱动等

这是后续优化方向。

需要以下 AI 协作：

1. **@NuPI** - 实现 Phase 2，调整 PiExecutor 和扩展能力
2. **@Piano** - 实现 Phase 3，重组工作流
3. **@Nezha** - 协调验证，确认数据库改动

---

## 预期收益

1. 任务分配更合理：代码操作 → Pi，复杂推理 → OpenCode
2. Pi 的能力被充分利用（read/edit/write/bash）
3. OpenCode 专注高价值推理任务
4. NuPI 扩展从被动工具变成主动执行者