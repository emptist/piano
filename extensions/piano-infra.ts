/**
 * Piano Infrastructure Extension for Pi
 *
 * 提供 Piano 的基础设施：数据库访问、记忆系统、任务查询等。
 * Pi 会自己决定怎么使用这些工具。
 *
 * 安装: 复制到 ~/.pi/agent/extensions/
 */

import { execSync } from 'child_process';

function runNezha(command: string): string {
  try {
    return execSync(`node /opt/homebrew/bin/nezha ${command}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });
  } catch (e: any) {
    return e.stdout || e.stderr || e.message;
  }
}

export default function pianoInfra(pi: any): void {
  pi.registerCommand('tasks', {
    description: '查询待处理任务',
    handler: async () => runNezha('tasks'),
  });

  pi.registerCommand('status', {
    description: '查看系统状态',
    handler: async () => runNezha('status'),
  });

  pi.registerCommand('who', {
    description: '查看谁在工作',
    handler: async () => runNezha('who-is-working'),
  });

  pi.registerCommand('learn', {
    description: '保存学习记忆',
    handler: async (content: string) => runNezha(`areflect "[LEARN] ${content}"`),
  });

  console.log('[Piano] 基础设施已就绪: tasks, status, who, learn');
}