# Piano

Piano 是 Nezha 的 OpenCode/Pi 三合一扩展模块，提供连续工作引擎和任务协调功能。

## 依赖关系

```
piano → nezha (核心库)
      → nupi (Pi 扩展)
      → @mariozechner/pi-coding-agent
      → opencode (外部 AI)
```

## 安装

```bash
npm install
```

## 构建

```bash
npm run build
```

## 开发

```bash
npm run dev
```

## 启动守护进程

```bash
npm run start:daemon
```

## 功能

- ContinuousWorkEngine: 连续工作引擎
- TaskRouter: 任务路由（internal/opencode/pi）
- TaskPlanner: 任务规划器
- TaskCoordinator: 任务协调器
- OpenCodeSessionManager: OpenCode 会话管理
- OpenCodeReminderService: OpenCode 提醒服务

## 架构

Piano 是三合一项目，可以自由依赖 Nezha、NuPI 和外部 AI 系统（OpenCode）。
