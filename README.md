# Piano

**任务路由和协调 AI** - 三合一系统 (Pi + Nezha + OpenCode)

## 快速开始

```bash
# 安装
npm install @nezha/piano

# 在任意项目目录启动 Piano
cd ~/your-project
piano

# 或启动 NuPI
nupi
```

### 启动命令

| 命令 | 说明 |
|------|------|
| `piano` | 启动 Piano (任务路由 AI) |
| `piano -p` | 同上，short flag |
| `piano --piano` | 同上，long flag |
| `piano nupi` | 切换到 NuPI 模式 |
| `nupi` | 启动 NuPI (本地 LLM) |
| `nupi piano` | 切换到 Piano 模式 |

**自动识别当前项目** - 在哪个目录运行 `piano`，就处理那个项目！

```bash
cd ~/gits/hub/tools_ai/refers/self_projects/coffeeclaw
piano  # 自动处理 coffeeclaw 项目
```

```typescript
class PianoHeartbeatService extends HeartbeatService {
  // TaskRouter - 决定任务发给哪个执行器
  // TaskCoordinator - 协调 OpenCode 执行
  // TaskPlanner - 任务分解和评估
  // PiExecutor - Pi 执行器
}
```

### 执行流程

```
Task → TaskRouter.route() →
  ├─ opencode → TaskCoordinator.execute()
  ├─ pi → TaskPlanner.plan() → PiExecutor.execute()
  └─ internal → HeartbeatService.executeInternalAI()
```

## 目录结构

```
piano/
├── src/
│   ├── router/          # TaskRouter
│   ├── coordinator/     # TaskCoordinator
│   ├── planner/         # TaskPlanner
│   ├── executor/        # PiExecutorWrapper
│   └── services/        # PianoHeartbeatService
├── deprecated/          # 已废弃代码
└── package.json        # @nezha/piano
```

## Workspace

Piano 是独立 npm 包 (@nezha/piano)：

```json
{
  "name": "@nezha/piano",
  "dependencies": { "nezha": "^0.1.0" }
}
```

### 安装使用

```bash
npm install @nezha/piano

// 代码中：
import { PianoHeartbeatService } from '@nezha/piano';
import { HeartbeatService } from 'nezha';
```

## 与核心的关系

- **继承关系**: `PianoHeartbeatService extends HeartbeatService`
- **依赖方向**: Piano → 核心（单向）
- **核心原则**: 核心不依赖子系统，子系统扩展核心

## 状态

- Piano 三合一系统 (Pi + Nezha + OpenCode) ✅
- 显式启动模式，不默认加载 ✅
- 双渠道 Issue (GitHub + Database) ✅
- 启动器已加入 /usr/local/bin/ ✅

---

## 如何在项目中使用 Piano

### 前提条件

1. PostgreSQL 数据库 (`nezha` 数据库存在)
2. 或者使用本地 npm link 模式（开发时）

### 方式 1：本地开发模式（现在就能用）

```bash
# 1. 链接本地 nezha（如果还没链接）
cd ~/gits/hub/your-project
npm link nezha

# 2. 链接 Piano
npm link @nezha/piano
```

### 方式 2：独立 npm 包（待发布）

```bash
npm install @nezha/piano
```

### 使用示例

```typescript
import { TaskRouter, TaskCoordinator, TaskPlanner } from "@nezha/piano";

// 1. 使用 TaskRouter 决定任务发给谁
const router = new TaskRouter({
  useOpenCode: true, // 启用 OpenCode
  usePi: true, // 启用 Pi
  complexityThreshold: 5,
  selfCapability: "pi",
});

const executor = router.route("你的任务", "任务描述");
// 返回: 'internal' | 'opencode' | 'pi'

// 2. 使用 TaskCoordinator 执行 OpenCode 任务
const coordinator = new TaskCoordinator({
  opencodeUrl: "http://localhost:4097",
  usePi: true,
});

const result = await coordinator.execute({
  id: "task-123",
  title: "重构代码",
  description: "重构 auth 模块",
  priority: 5,
});

// 3. 使用 TaskPlanner 评估任务复杂度
const planner = new TaskPlanner();
const planned = planner.plan(
  {
    id: "task-123",
    title: "写测试",
    description: "为 UserService 写单元测试",
    priority: 3,
  },
  "pi",
);

console.log(planned.shouldDelegate); // 是否需要委托
console.log(planned.complexity); // 复杂度评分 (1-5)
```

### 完整：PianoHeartbeatService

```typescript
import { PianoHeartbeatService } from "@nezha/piano";
import { DatabaseClient } from "nezha";

// 创建数据库客户端
const db = new DatabaseClient({ connectionString: "postgresql://..." });

// 创建 Piano 心跳服务
const piano = new PianoHeartbeatService(db, {
  opencodeUrl: "http://localhost:4097",
  useOpenCode: true,
  usePi: true,
  enablePi: true,
});

// 启动服务
piano.start();
```

### 配置项

| 选项           | 类型    | 说明                                 |
| -------------- | ------- | ------------------------------------ |
| `opencodeUrl`  | string  | OpenCode API 地址                    |
| `opencodeAuth` | object  | OpenCode 认证 { username, password } |
| `useOpenCode`  | boolean | 是否启用 OpenCode                    |
| `enablePi`     | boolean | 是否启用 Pi 执行器                   |

### 使用示例

#### 1. 任务路由示例

```typescript
import { TaskRouter } from "@nezha/piano";

const router = new TaskRouter({
  useOpenCode: true,
  usePi: true,
  complexityThreshold: 5,
  selfCapability: "pi",
});

// 简单任务 → internal AI
const simple = router.route("修复拼写错误", "修复 README 中的拼写错误");
// 结果: 'internal'

// 中等复杂度 → OpenCode
const medium = router.route("重构代码", "重构 UserService 使用新架构");
// 结果: 'opencode'

// 复杂任务 → Pi
const complex = router.route("实现新功能", "实现完整的用户认证系统");
// 结果: 'pi'
```

#### 2. 任务协调示例

```typescript
import { TaskCoordinator } from "@nezha/piano";

const coordinator = new TaskCoordinator({
  opencodeUrl: "http://localhost:4097",
  usePi: true,
});

// 执行任务
const result = await coordinator.execute({
  id: "task-123",
  title: "重构代码",
  description: "重构 auth 模块",
  priority: 5,
});
```

#### 3. 任务规划示例

```typescript
import { TaskPlanner } from "@nezha/piano";

const planner = new TaskPlanner();

const planned = planner.plan(
  {
    id: "task-123",
    title: "实现登录功能",
    description: "实现完整的登录流程，包括验证码",
  },
  "pi",
);

console.log(planned.shouldDelegate); // 是否需要委托
console.log(planned.complexity); // 复杂度 1-5
console.log(planned.subtasks); // 分解的子任务
```

### 任务来源

Piano 通过 `nezha` CLI 获取任务，与其他 AI 互联：

```bash
# 查看任务
nezha tasks

# 持续改进循环
nezha improve

# 广播给其他 AI
nezha share <消息>

# 保存学习
nezha learn <内容>
```

当 nezha 核心添加任务时，带 `[Piano]` 前缀的任务会自动由 Piano 处理。
