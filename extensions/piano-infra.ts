import type { ExtensionAPI } from './shared.js';
import { runNezha } from './shared.js';

export default function pianoInfra(pi: ExtensionAPI): void {
  pi.registerCommand('tasks', {
    description: '查询待处理任务',
    handler: async () => await runNezha('tasks'),
  });

  pi.registerCommand('status', {
    description: '查看系统状态',
    handler: async () => await runNezha('status'),
  });

  pi.registerCommand('who', {
    description: '查看谁在工作',
    handler: async () => await runNezha('who-is-working'),
  });

  pi.registerCommand('learn', {
    description: '保存学习记忆',
    handler: async (content: string) => await runNezha(`areflect "[LEARN] ${content}"`),
  });

  console.log('[Piano] 基础设施已就绪: tasks, status, who, learn (HTTP API)');
}
