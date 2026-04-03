import { randomUUID } from 'crypto';

const NEZHA_API = 'http://127.0.0.1:4099';

async function apiPost(path: string, body: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${NEZHA_API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json() as { id?: string; error?: string };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

async function apiGet(path: string): Promise<{ error?: string; data?: unknown }> {
  try {
    const res = await fetch(`${NEZHA_API}/${path}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { data: await res.json() };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

let apiHealthy: boolean | null = null;

async function checkApi(): Promise<boolean> {
  const result = await apiGet('health');
  apiHealthy = !result.error;
  return apiHealthy;
}

export default function pianoAutoWork(pi: any): void {
  const DELEGATE_ALL = process.env.PIANO_DELEGATE_ALL !== 'false';

  pi.on('session_start', async () => {
    const healthy = await checkApi();
    console.log(`[Piano] Ready. /piano-start to delegate${healthy ? ' (via API)' : ' (API offline, need: nezha start)'}.`);
  });

  pi.registerCommand('piano-start', {
    description: 'Delegate work to Nezha/OpenCode',
    handler: async () => {
      if (!DELEGATE_ALL) {
        pi.sendUserMessage('Autonomous mode: run /piano-tasks.', { deliverAs: 'steer' });
        return 'Piano auto-work started.';
      }

      if (apiHealthy === false) {
        console.log('[Piano] Nezha API offline. Run: nezha start');
        return '[Piano] Nezha API not available. Run "nezha start" first.';
      }

      console.log('[Piano] Triggering improvement cycle...');

      const result = await apiPost('tasks', {
        title: 'Continuous Improvement Cycle',
        description: 'Review codebase, find issues, create improvement tasks. PDCA cycle.',
        priority: 10,
        category: 'bugfix',
        type: 'implementation',
      });

      if (result.error || !result.id) {
        apiHealthy = false;
        console.error(`[Piano] Error: ${result.error || 'no task ID'}`);
        return `[Piano] Error: ${result.error || 'failed'} (is nezha running?)`;
      }

      console.log(`[PianO] Done. Task ${result.id.slice(0,8)}... queued.`);

      pi.sendUserMessage('Done. Say "Done." and stop.', { deliverAs: 'steer' });
      return 'Done.';
    },
  });

  pi.registerCommand('piano-tasks', {
    description: 'Show pending tasks or API status',
    handler: async () => {
      if (apiHealthy === false) {
        return '[Piano] Nezha API offline. Run "nezha start" to enable.';
      }

      const result = await apiGet('tasks?status=PENDING&limit=3');
      if (result.error) {
        apiHealthy = false;
        return `[Piano] API error: ${result.error}. Try: nezha start`;
      }

      const tasks = result.data as Array<{ title: string; priority: number }>;
      const lines = tasks.map(t => `  [P${t.priority}] ${t.title}`).join('\n') || '  (no pending tasks)';
      const msg = `[Piano] Pending:\n${lines}`;
      console.log(msg);
      return msg;
    },
  });

  console.log('[Piano] Loaded. /piano-start, /piano-tasks');
}
