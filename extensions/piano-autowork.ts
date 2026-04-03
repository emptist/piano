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
    console.log('[Piano] Ready. /piano-start to delegate, /piano-tasks for tasks.');
  });

  pi.registerCommand('piano-start', {
    description: 'Delegate work to Nezha/OpenCode (fast)',
    handler: async () => {
      if (!DELEGATE_ALL) {
        pi.sendUserMessage(
          'Autonomous mode: run /piano-tasks to see tasks.',
          { deliverAs: 'steer' }
        );
        return 'Piano auto-work started.';
      }

      console.log('[Piano] Triggering improvement cycle...');

      const improve = runNezha('continuous-improvement');
      if (improve.includes('[nezha error]')) {
        console.error(`[Piano] Nezha error:\n${improve}`);
        return '[Piano] Error triggering improvement cycle.';
      }

      console.log('[PianO] Done. Task queued for OpenCode.');

      pi.sendUserMessage(
        'Done. Say "Done." and stop.',
        { deliverAs: 'steer' }
      );

      return 'Done.';
    },
  });

  pi.registerCommand('piano-tasks', {
    description: 'Show pending Nezha tasks (slow: ~30s)',
    handler: async () => {
      console.log('[Piano] Fetching tasks (this takes ~30s)...');
      const tasks = runNezha('tasks --status PENDING');
      console.log(tasks);
      return tasks.substring(0, 500);
    },
  });

  console.log('[Piano] Loaded. /piano-start (fast), /piano-tasks (slow)');
}
