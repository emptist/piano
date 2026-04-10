import type { ExtensionAPI } from './shared.js';
import { runNezha } from './shared.js';

export default function pianoTools(pi: ExtensionAPI): void {
  pi.registerCommand('piano-tasks', {
    description: 'Query pending tasks from Nezha',
    handler: async () => await runNezha('tasks'),
  });

  pi.registerCommand('piano-status', {
    description: 'Show Piano/Nezha system status',
    handler: async () => `Piano Status:\n${await runNezha('status')}`,
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
    handler: async () => await runNezha('who-is-working'),
  });

  pi.registerCommand('piano-improve', {
    description: 'Run continuous improvement cycle',
    handler: async () => await runNezha('improve'),
  });

  console.log('[Piano] Tools loaded: piano-tasks, piano-status, piano-share, piano-learn, piano-who, piano-improve (HTTP API)');
}
