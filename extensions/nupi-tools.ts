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
import { execSync } from 'child_process';

const NEZHA_CLI = process.env.NEZHA_CLI || 'nezha';

function runNezhaCli(args: string): string {
  try {
    return execSync(`${NEZHA_CLI} ${args}`, { encoding: 'utf-8', timeout: 15000 });
  } catch (e: any) {
    throw new Error(`CLI failed: ${e.message?.split('\n')?.[0] || e.message}`);
  }
}

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

  pi.registerCommand('nupi-meetings', {
    description: 'List active meetings',
    handler: async () => {
      try {
        return runNezhaCli('meeting db list --status active');
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-meeting', {
    description: 'Show meeting details (arg: meeting UUID)',
    handler: async (id: string) => {
      try {
        if (!id.trim()) return 'Usage: nupi-meeting <uuid>';
        return runNezhaCli(`meeting db show ${id.trim()}`);
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-meeting-discuss', {
    description: 'Create a meeting discussion (arg: topic)',
    handler: async (topic: string) => {
      try {
        if (!topic.trim()) return 'Usage: nupi-meeting-discuss <topic>';
        return runNezhaCli(`meeting db create "${topic.trim()}"`);
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-meeting-opinion', {
    description: 'Add opinion to meeting (arg: <uuid> <perspective> [--position support|oppose|neutral])',
    handler: async (args: string) => {
      try {
        const parts = args.trim().split(/\s+/);
        const meetingId = parts[0];
        if (!meetingId) return 'Usage: nupi-meeting-opinion <uuid> <perspective> [--position support|oppose|neutral]';
        const rest = parts.slice(1).join(' ');
        return runNezhaCli(`meeting db opinion ${meetingId} "${rest}"`);
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  pi.registerCommand('nupi-meeting-consensus', {
    description: 'Record consensus for meeting (arg: <uuid> <consensus text>)',
    handler: async (args: string) => {
      try {
        const parts = args.trim().split(/\s+/);
        const meetingId = parts[0];
        if (!meetingId) return 'Usage: nupi-meeting-consensus <uuid> <text>';
        const text = parts.slice(1).join(' ');
        return runNezhaCli(`meeting db consensus ${meetingId} "${text}"`);
      } catch (error) {
        return `[NuPI] Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  console.log(
    '[NuPI] Tools loaded (HTTP API mode): nupi-tasks, nupi-task-take, nupi-task-done, nupi-issues, nupi-learn, nupi-search, nupi-status, nupi-work, nupi-meetings, nupi-meeting, nupi-meeting-discuss, nupi-meeting-opinion, nupi-meeting-consensus'
  );
}
