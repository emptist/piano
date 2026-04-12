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