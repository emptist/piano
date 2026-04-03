/**
 * NuPI Tools Extension for Pi
 *
 * Provides direct access to NuPI (Nezha united with PI) database.
 * Uses direct SQL - no MCP needed!
 */

import pg from 'pg';
import { execSync } from 'child_process';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

const { Client } = pg;

const DEFAULT_WORKDIR = process.cwd();

function getDbConfig() {
  return {
    host: process.env.NEZHA_DB_HOST || 'localhost',
    port: parseInt(process.env.NEZHA_DB_PORT || '5432', 10),
    database: process.env.NEZHA_DB_NAME || 'nezha',
    user: process.env.NEZHA_DB_USER || 'postgres',
    password: process.env.NEZHA_DB_PASSWORD || 'postgres',
  };
}

function getWorkDir(): string {
  return process.env.NEZHA_WORKDIR || DEFAULT_WORKDIR;
}

const NEZHA_CLI = process.env.NEZHA_BIN || (() => {
  try {
    return execSync('which nezha', { encoding: 'utf-8' }).trim();
  } catch {
    return 'nezha';
  }
})();

async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = new Client(getDbConfig());
  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result.rows;
  } catch (e: unknown) {
    const err = e as { message?: string };
    return [{ error: err.message || String(e) }];
  } finally {
    await client.end();
  }
}

function runCli(command: string, cwd?: string): string {
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: cwd || getWorkDir(),
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!result) return '(no output)';
    return result;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string; status?: number };
    const output = (err.stdout || '') + (err.stderr || '');
    if (output.trim()) return `[cli error:${err.status ?? '?'}] ${output.trim()}`;
    return `[cli error] ${err.message || String(e)}`;
  }
}

function sanitizeForCli(input: string): string {
  return input
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, ' ')
    .substring(0, 500);
}

export default function nupiTools(pi: ExtensionAPI): void {

  pi.registerCommand('nupi-tasks', {
    description: 'List pending tasks (NuPI)',
    handler: async () => {
      const tasks = await dbQuery(
        `SELECT id, title, priority, created_by FROM tasks 
         WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 10`
      );
      if (!tasks.length || (tasks[0] as any).error) return 'No tasks or error';
      return tasks.map((t: any) => `[P${t.priority}] ${t.title}`).join('\n');
    },
  });

  pi.registerCommand('nupi-task-take', {
    description: 'Take a task by ID',
    handler: async (id: string) => {
      await dbQuery(
        "UPDATE tasks SET status = 'RUNNING', assigned_to = 'nupi', updated_at = NOW() WHERE id = $1",
        [id.trim()]
      );
      return `Task ${id} taken`;
    },
  });

  pi.registerCommand('nupi-task-done', {
    description: 'Complete a task by ID',
    handler: async (taskId: string) => {
      await dbQuery(
        "UPDATE tasks SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [taskId.trim()]
      );
      return `Task ${taskId} completed`;
    },
  });

  pi.registerCommand('nupi-issues', {
    description: 'List open issues',
    handler: async () => {
      const issues = await dbQuery(
        `SELECT id, title, severity FROM issues 
         WHERE status NOT IN ('resolved', 'closed') ORDER BY severity DESC LIMIT 10`
      );
      if (!issues.length || (issues[0] as any).error) return 'No issues';
      return issues.map((i: any) => `[${i.severity}] ${i.title}`).join('\n');
    },
  });

  pi.registerCommand('nupi-learn', {
    description: 'Save learning insight',
    handler: async (insight: string) => {
      const safe = sanitizeForCli(insight);
      const result = runCli(
        `node ${NEZHA_CLI} areflect "[LEARN] insight: ${safe}"`,
        getWorkDir()
      );
      return result.includes('saved') ? 'Saved!' : result.substring(0, 100);
    },
  });

  pi.registerCommand('nupi-search', {
    description: 'Search memory',
    handler: async (queryStr: string) => {
      const results = await dbQuery(
        `SELECT content, created_at FROM memory 
         WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT 5`,
        [`%${queryStr.trim()}%`]
      );
      if (!results.length || (results[0] as any).error) return 'No results';
      return results
        .map((r: any) => `${r.created_at}: ${r.content.substring(0, 80)}...`)
        .join('\n');
    },
  });

  pi.registerCommand('nupi-status', {
    description: 'Get NuPI system status',
    handler: async () => {
      const [tasks, issues, memories] = await Promise.all([
        dbQuery("SELECT COUNT(*) as c FROM tasks WHERE status = 'PENDING'"),
        dbQuery("SELECT COUNT(*) as c FROM issues WHERE status NOT IN ('resolved', 'closed')"),
        dbQuery('SELECT COUNT(*) as c FROM memory'),
      ]);
      const t = (tasks[0] as any)?.c || 0;
      const i = (issues[0] as any)?.c || 0;
      const m = (memories[0] as any)?.c || 0;
      return `Tasks: ${t} | Issues: ${i} | Memory: ${m}`;
    },
  });

  pi.registerCommand('nupi-docs', {
    description: 'Get table documentation',
    handler: async () => {
      const docs = await dbQuery(
        `SELECT table_name, purpose FROM table_documentation 
         WHERE ai_can_modify = true ORDER BY table_name`
      );
      if (!docs.length) return 'No docs';
      return docs.map((d: any) => `- ${d.table_name}: ${d.purpose}`).join('\n');
    },
  });

  pi.registerCommand('nupi-work', {
    description: 'Start autonomous work mode',
    handler: async () => {
      const tasks = await dbQuery(
        `SELECT id, title, priority FROM tasks 
         WHERE status = 'PENDING' ORDER BY priority DESC LIMIT 3`
      );
      if (!tasks.length) return 'No tasks. Check issues instead.';
      const t = tasks[0] as any;
      return `Next task [P${t.priority}]: ${t.title}
ID: ${t.id}

Actions:
1. nupi-task-take ${t.id}
2. Do the work
3. nupi-task-done ${t.id}`;
    },
  });

  console.log(
    '[NuPI] Tools loaded: nupi-tasks, nupi-task-take, nupi-task-done, nupi-issues, nupi-learn, nupi-search, nupi-status, nupi-docs, nupi-work'
  );
}
