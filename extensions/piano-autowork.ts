const NEZHA_API = 'http://127.0.0.1:4099';
const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 5000;

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

async function waitForApi(attempts: number = MAX_RETRIES): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    console.log(`[Piano] Checking Nezha API... (${i}/${attempts})`);
    const result = await apiGet('health');
    if (!result.error) {
      apiHealthy = true;
      console.log('[Piano] Nezha API is online.');
      return true;
    }
    apiHealthy = false;
    if (i < attempts) {
      console.log(`[Piano] Not responding. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  console.log(`[Piano] Nezha API did not respond after ${attempts} attempts.`);
  return false;
}

async function delegateToNezha(pi: any): Promise<string> {
  if (apiHealthy === false && !(await waitForApi(2))) {
    return '[Piano] Nezha API not available. Run "nezha start" first.';
  }

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
}

export default function pianoAutoWork(pi: any): void {
  const DELEGATE_ALL = process.env.PIANO_DELEGATE_ALL !== 'false';

  pi.on('session_start', async () => {
    if (!DELEGATE_ALL) {
      console.log('[Piano] Autonomous mode. /piano-start to delegate, /piano-tasks for tasks.');
      return;
    }

    console.log('[Piano] Connecting to Nezha...');
    const healthy = await waitForApi(MAX_RETRIES);

    if (!healthy) {
      console.log('[Piano] Could not reach Nezha. /piano-start to retry later.');
      return;
    }

    console.log('[Piano] Auto-delegating to Nezha/OpenCode...');
    await delegateToNezha(pi);
  });

  pi.registerCommand('piano-start', {
    description: 'Delegate work to Nezha/OpenCode (with retry)',
    handler: async () => delegateToNezha(pi),
  });

  pi.registerCommand('piano-tasks', {
    description: 'Show pending tasks or API status',
    handler: async () => {
      if (apiHealthy === false) {
        const ok = await waitForApi(2);
        if (!ok) return '[Piano] Nezha API offline. Run "nezha start" to enable.';
      }
      const result = await apiGet('tasks?status=PENDING&limit=3');
      if (result.error) {
        apiHealthy = false;
        return `[Piano] API error: ${result.error}. Try: nezha start`;
      }
      const tasks = result.data as Array<{ title: string; priority: number }>;
      const lines = tasks.map(t => `  [P${t.priority}] ${t.title}`).join('\n') || '  (no pending tasks)';
      return `[Piano] Pending:\n${lines}`;
    },
  });

  console.log('[Piano] Loaded. Auto-delegates on start. /piano-tasks for status.');
}
