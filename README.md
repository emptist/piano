# Piano

**任务路由和协调子系统**，扩展 Nezha 核心的 HeartbeatService。

## 架构

Piano 继承核心 HeartbeatService，添加任务路由功能：

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

Piano 是 Nezha monorepo 的子系统：

```json
{
  "name": "@nezha/piano",
  "dependencies": { "nezha": "^0.1.0" }
}
```

### 未来：独立 npm 包

搬出 monorepo 后：

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

- HeartbeatService 核心已清理，只保留内部 AI 执行 ✅
- PianoHeartbeatService 子类代码已写好，待 npm 包化后启用 ⚙️

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
