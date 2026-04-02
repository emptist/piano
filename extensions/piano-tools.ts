/**
 * Piano Tools Extension for Pi
 *
 * Piano AI 的 Pi 扩展，提供任务路由和协调功能。
 *
 * 安装:
 * cp piano-tools.ts ~/.pi/agent/extensions/
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

export default function pianoTools(pi: any): void {
  pi.registerCommand('piano-tasks', {
    description: 'Query pending tasks from Nezha',
    handler: async () => runNezha('tasks'),
  });

  pi.registerCommand('piano-status', {
    description: 'Show Piano/Nezha system status',
    handler: async () => `Piano Status:\n${runNezha('status')}`,
  });

  pi.registerCommand('piano-share', {
    description: 'Broadcast message to all AIs',
    handler: async () => {
      return 'Usage: piano-share "message" - use share command';
    },
  });

  pi.registerCommand('piano-learn', {
    description: 'Save learning to Nezha memory',
    handler: async () => {
      return 'Usage: piano-learn "content" - use learn command';
    },
  });

  pi.registerCommand('piano-who', {
    description: 'Show which AI is working on what',
    handler: async () => runNezha('who-is-working'),
  });

  pi.registerCommand('piano-improve', {
    description: 'Run continuous improvement cycle',
    handler: async () => runNezha('improve'),
  });

  console.log('[Piano] Tools loaded: piano-tasks, piano-status, piano-share, piano-learn, piano-who, piano-improve');
}
