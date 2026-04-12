# ExternalDelegate API 修复全过程

**Issue:** #3ff28b4b  
**Date:** 2026-04-13  
**Severity:** High

---

## 问题

NuPI ExternalDelegate delegation 到 OpenCode 失败，返回 HTTP 400 错误。

---

## 根因分析

### 1. 复制代码导致不同步 (根本原因)
Piano 复制了 ExternalDelegate 的 inline 配置而不是 import @nezha/nupi：
```typescript
// piano/extensions/nupi-autowork.ts (line 259-278)
externalDelegate = createExternalDelegate({
  mode: "external",
  agents: { opencode: { url: "...", tools: [...] } }
});
```
没有使用 import，导致修复不同步。

### 2. 编译输出位置错误
`tsc` 输出到 `dist/services/services/` 而不是 `dist/services/`，导致加载旧代码：
```bash
ls dist/services/services/ExternalDelegate.js  # 存在但未被加载
ls dist/services/ExternalDelegate.js    # 不存在
```

### 3. 没有验证编译结果
每次修改后没有检查 dist 文件实际内容，时间戳相同被误认为新文件。

### 4. 成功定义不完整
只检查 `exitCode===0` 但 OpenCode 返回 `info.finish==="stop"`。

---

## 修复内容

### 1. 使用 minimal payload
```typescript
const taskPayload = {
  parts: [{ type: 'text', text: task }],
};
```

### 2. 成功判断
```typescript
const success = result.exitCode === 0 || info.info?.finish === 'stop';
```

### 3. 输出提取
```typescript
private extractOutput(result: SingleResult): string {
  // Try direct parts property
  const r = result as unknown as { parts?: Array<{ text?: string }> };
  if (r.parts) {
    return r.parts.filter(p => !!p.text).map(p => p.text).join('\n');
  }
  return result.stderr || '';
}
```

---

## 教训

1. **不要复制代码** - 始终使用 import
2. **强制重新编译** - `rm -rf dist && npx tsc`
3. **验证关键字符串** - `grep taskPayload dist/...`
4. **端到端测试** - 用 curl 测试 API
5. **检查所有成功字段** - response 结构可能有多种形式

---

## 相关文件

- `nupi/src/services/ExternalDelegate.ts` - 源文件
- `nupi/dist/services/ExternalDelegate.js` - 编译输出
- `piano/extensions/nupi-autowork.ts` - 使用方 (通过 import)

---

# 架构修复: 移除全局扩展污染

**Date:** 2026-04-13

## 问题

运行 `pi` 时报错：
```
Error: Failed to load extension "...nupi-autowork.ts": Cannot find module '@nezha/nupi'
```

原因：Pi 被 NuPI/Piano 依赖污染。

## 根因

错误架构：
```
Pi (standalone agent)
    ↓ wrongly infected by
NuPI/Piano dependencies (@nezha/nupi)
```

`~/.pi/agent/extensions/` 包含外部项目代码，通过 symlink 引用时，`@nezha/nupi` 包在 Pi 的运行时无法解析。

## 解决方案

移除全局扩展符号链接，每个项目使用自己的本地扩展：

```bash
# 移除
rm ~/.pi/agent/extensions/nupi-autowork.ts
rm ~/.pi/agent/extensions/nupi-tools.ts
```

正确架构：
- Pi: 独立运行，无外部依赖
- NuPI 项目: 使用 `nupi/extensions/` 本地扩展
- Piano 项目: 使用 `piano/extensions/` 本地扩展

## 当前状态

```
~/.pi/agent/extensions/  (仅内置文件)
├── AGENTS.md
├── MEMORY.md
├── README.md
├── SOUL.md
└── USER.md
```

## 教训

1. **不要污染全局扩展** - 每个项目管理自己的扩展
2. **独立架构** - Pi 应该是独立的，不依赖外部包
3. **使用绝对路径** - 如果必须引用，用绝对路径而非包名