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
  const AUTO_WORK_PROMPT = `
## Piano Auto-Work Mode

You are an autonomous AI. Don't ask humans questions, go find tasks yourself!

### Work Priority (check in order):
1. **Pending tasks** - run: piano-tasks
2. **Continuous improvement** - run: piano-improve
3. **Broadcast collaboration** - check who needs help
4. **Code review** - check recent commits
5. **Learn memory** - search relevant knowledge

### Workflow:
1. Run: piano-tasks -> pick highest priority task
2. Execute the task
3. Run: piano-learn "learned..."
4. Continue to next task

### Core Principles:
- **Never ask humans questions**
- **Always find the next thing to do**
- **Proactively help other AIs**
- **Work continuously**

Start now! First run: piano-tasks
`;

  pi.on('session_start', async () => {
    console.log('[Piano] Auto-work mode ready. Type "piano-start" to begin!');
  });

  pi.registerCommand('piano-work', {
    description: 'Start Piano autonomous work mode',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano auto-work started! Run piano-tasks to begin.';
    },
  });

  pi.registerCommand('piano-start', {
    description: 'Start Piano continuous work cycle',
    handler: async () => {
      pi.sendUserMessage(AUTO_WORK_PROMPT, { deliverAs: 'steer' });
      return 'Piano autonomous work mode started!';
    },
  });

  console.log('[Piano] Auto-work extension loaded. Use "piano-start" to begin!');
}
