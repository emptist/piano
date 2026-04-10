import { execSync } from 'child_process';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getNuPIClient } from '@nezha/nupi';

export type { ExtensionAPI };

const NEZHA_PATH = process.env.NEZHA_BIN || (() => {
  try {
    return execSync('which nezha', { encoding: 'utf-8' }).trim();
  } catch {
    return 'nezha';
  }
})();

let nupiClient: ReturnType<typeof getNuPIClient> | null = null;

function getNezhaClient() {
  if (!nupiClient) {
    nupiClient = getNuPIClient();
  }
  return nupiClient;
}

export async function runNezha(command: string, options?: { timeout?: number }): Promise<string> {
  const cmdParts = command.trim().split(/\s+/);
  const cmd = cmdParts[0]?.toLowerCase() || '';
  const args = cmdParts.slice(1);

  try {
    switch (cmd) {
      case 'tasks': {
        const limit = parseInt(args[0]) || 10;
        const status = args[1] || 'PENDING';
        const result = await getNezhaClient().getTasks({ status, limit });
        if (result.rows.length === 0) return '(no tasks)';
        return result.rows.map(t => `${t.id?.slice(0,8)} ${t.title} [${t.status}]`).join('\n');
      }
      case 'status': {
        const tasks = await getNezhaClient().getTasks({ limit: 1 });
        return `Piano running. Tasks: ${tasks.rowCount}`;
      }
      case 'who-is-working': {
        const result = await getNezhaClient().getBroadcasts({ limit: 5 });
        return result.rows.map(b => `${b.from_ai}: ${b.content?.slice(0,50)}`).join('\n') || '(no activity)';
      }
      case 'areflect': {
        const text = args.join(' ');
        const match = text.match(/\[LEARN\]\s*(.+)/i);
        if (match) {
          await getNezhaClient().saveLearning({ insight: match[1].trim() });
          return 'Learning saved!';
        }
      }
      default:
        return `[info] Using HTTP API (fallback to CLI for: ${command})`;
    }
  } catch (e) {
    console.error('[Piano] HTTP API error, falling back to CLI:', e);
  }

  // Fallback to CLI for unsupported commands
  try {
    const result = execSync(`node ${NEZHA_PATH} ${command}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: options?.timeout ?? 60000,
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
