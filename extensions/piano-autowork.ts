/**
 * Piano Auto-Work Extension for Pi
 *
 * Provides Piano autonomous work mode:
 * 1. Auto-checks pending tasks on startup
 * 2. Proactively finds work when idle
 * 3. Doesn't ask humans, just works
 */

import { execSync } from 'child_process';

const NEZHA_PATH = process.env.NEZHA_BIN || (() => {
  try {
    return execSync('which nezha', { encoding: 'utf-8' }).trim();
  } catch {
    return 'nezha';
  }
})();

function runNezha(command: string): string {
  try {
    const result = execSync(`node ${NEZHA_PATH} ${command}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!result) return '(no output)';
    return result;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string; status?: number };
    const output = (err.stdout || '') + (err.stderr || '');
    if (output.trim()) return `[nezha error:${err.status ?? '?'}] ${output.trim()}`;
    return `[nezha error] ${err.message || String(e)}`;
  }
}

export default function pianoAutoWork(pi: any): void {
  const DELEGATE_ALL = process.env.PIANO_DELEGATE_ALL !== 'false';

  pi.on('session_start', async () => {
    console.log('[Piano] Auto-work mode ready. Type "piano-start" to begin!');
  });

  pi.registerCommand('piano-work', {
    description: 'Start Piano autonomous work mode',
    handler: async () => {
      if (DELEGATE_ALL) {
        return startDelegatedCycle();
      }
      pi.sendUserMessage(
        'You are in autonomous work mode. Run: piano-tasks to see pending tasks, then execute them.',
        { deliverAs: 'steer' }
      );
      return 'Piano auto-work started!';
    },
  });

  pi.registerCommand('piano-start', {
    description: 'Start Piano continuous work cycle',
    handler: async () => {
      if (DELEGATE_ALL) {
        return startDelegatedCycle();
      }
      pi.sendUserMessage(
        'You are in autonomous work mode. Run: piano-tasks to see pending tasks, then execute them.',
        { deliverAs: 'steer' }
      );
      return 'Piano autonomous work mode started!';
    },
  });

  console.log('[Piano] Auto-work extension loaded. Use "piano-start" to begin!');
}

function startDelegatedCycle(): string {
  console.log('[Piano] Delegating to Nezha/OpenCode (delegateAll mode)...');

  const tasks = runNezha('tasks --status PENDING');
  if (tasks.includes('[nezha error]') || tasks.includes('(no output)')) {
    return `[Piano] Could not fetch tasks:\n${tasks}`;
  }

  const improve = runNezha('continuous-improvement');

  return `[Piano] Delegation cycle triggered:

TASKS:
${tasks}

IMPROVE:
${improve}

Tasks are now in Nezha queue. OpenCode will pick them up.
Run "piano-start" again to check progress or add more work.`;
}
