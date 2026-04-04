/**
 * NuPI Tools Extension for Pi
 *
 * Provides access to NuPI (Nezha united with PI) via HTTP API.
 *
 * Migration (Phase 3): Removed all direct pg.Client connections, execSync calls,
 * and hardcoded credentials. Now uses NuPIClient for all database operations.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getNuPIClient } from '@nezha/nupi';

export default function nupiTools(pi: ExtensionAPI): void {
  const api = getNuPIClient();

  pi.registerCommand('nupi-tasks', {
    description: 'List pending tasks (NuPI)',
    handler: async () => {
      try {
        const result = await api.getTasks({ status: 'PENDING', limit: 10 });
        if (!result.rows.length) return 'No pending tasks';
        return result.rows
          .map((t: any) => `[P${t.priority}] ${t.title}`)
          .join('\n');
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-task-take', {
    description: 'Take a task by ID',
    handler: async (id: string) => {
      try {
        await api.updateTaskStatus(id.trim(), 'RUNNING');
        return `Task ${id} taken`;
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-task-done', {
    description: 'Complete a task by ID',
    handler: async (taskId: string) => {
      try {
        await api.updateTaskStatus(taskId.trim(), 'COMPLETED');
        return `Task ${taskId} completed`;
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-issues', {
    description: 'List open issues',
    handler: async () => {
      try {
        const issues = await api.getIssues(10);
        if (!issues.length) return 'No open issues';
        return issues.map((i: any) => `[${i.severity}] ${i.title}`).join('\n');
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-learn', {
    description: 'Save learning insight via NuPI API',
    handler: async (insight: string) => {
      try {
        await api.saveMemory(insight, ['learn', 'pi']);
        return 'Saved!';
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-search', {
    description: 'Search memory via NuPI API',
    handler: async (queryStr: string) => {
      try {
        const results = await api.searchMemory(queryStr.trim(), 5);
        if (!results.length) return 'No results';
        return results
          .map((r: any) => `${r.created_at}: ${(r.content || '').substring(0, 80)}...`)
          .join('\n');
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-status', {
    description: 'Get NuPI system status',
    handler: async () => {
      try {
        const status = await api.getSystemStatus();
        return `Tasks: ${status.pendingTasks} | Issues: ${status.openIssues} | Memory: ${status.memoryCount}`;
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-work', {
    description: 'Start autonomous work mode',
    handler: async () => {
      try {
        const result = await api.getTasks({ status: 'PENDING', limit: 3 });
        if (!result.rows.length) return 'No tasks. Check issues instead.';
        const t = result.rows[0] as any;
        return `Next task [P${t.priority}]: ${t.title}
ID: ${t.id}

Actions:
1. nupi-task-take ${t.id}
2. Do the work
3. nupi-task-done ${t.id}`;
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  console.log(
    '[NuPI] Tools loaded (HTTP API mode): nupi-tasks, nupi-task-take, nupi-task-done, nupi-issues, nupi-learn, nupi-search, nupi-status, nupi-work'
  );
}
