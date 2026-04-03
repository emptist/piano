# Upstream Fix: Command Injection in PiExecutor (C4/X2)

**Target:** `nezha/src/services/PiExecutor.ts`  
**Also affects:** `nupi/src/services/PiExecutor.ts` (if independent copy)  
**Date:** 2026-04-03

---

## Problem

All three `execute*()` methods use **string interpolation** to build shell commands, passing user-controlled input (`taskDescription`, `systemPrompt`) into a shell command string:

```typescript
const escapedDescription = taskDescription.replace(/"/g, '\\"');
const command = `${this.piPath} execute --model ${this.defaultModel} --print "${escapedDescription}"`;
await execAsync(command, { ... });
```

Only double quotes are escaped. The following characters break out of the shell context:
- Backticks `` ` `` — command substitution
- `$()` — command substitution
- `\n` (newline) — command separator
- `;` — command separator
- `\` — escape character bypass

**Impact:** If `taskDescription` comes from untrusted input (DB, API), arbitrary commands execute on the host.

---

## Solution

Replace `exec()` + string interpolation with `spawn()` + argument array with `{ shell: false }`. The OS kernel handles argument boundary separation — no escaping needed.

### Full Replacement File Content for `nezha/src/services/PiExecutor.ts`

```typescript
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

export interface PiTaskResult {
  success: boolean;
  output: string;
  message: string;
  durationMs: number;
  toolsCreated?: string[];
}

export interface PiConfig {
  piPath?: string;
  model?: string;
  env?: Record<string, string>;
}

function execSafe(
  command: string,
  args: string[],
  options: { timeout: number; env: Record<string, string> },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      timeout: options.timeout,
      env: options.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Pi execution timeout after ${options.timeout}ms`));
    }, options.timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

export class PiExecutor {
  private readonly piPath: string;
  private readonly defaultModel: string;
  private readonly env: Record<string, string>;

  constructor(config: PiConfig = {}) {
    this.piPath = config.piPath || 'pi';
    this.defaultModel = config.model || 'zai:glm-4.5-flash';
    this.env = config.env || {};
  }

  async execute(taskDescription: string, timeoutMs: number = 600000): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing task (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['execute', '--model', this.defaultModel, '--print', taskDescription],
        { timeout: timeoutMs, env: { ...process.env, ...this.env } },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes('error') && !output.toLowerCase().includes('failed');

      return {
        success,
        output,
        message: success ? 'Task completed successfully' : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[PiExecutor] Failed: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  async executeJson(taskDescription: string, timeoutMs: number = 600000): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing JSON task (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['execute', '--model', this.defaultModel, '--mode', 'json', taskDescription],
        { timeout: timeoutMs, env: { ...process.env, ...this.env } },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success = !output.toLowerCase().includes('error');

      const toolsCreated = this.extractToolsCreated(output);

      return {
        success,
        output,
        message: success ? 'Task completed' : 'Task failed',
        durationMs,
        toolsCreated,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }

  private extractToolsCreated(output: string): string[] {
    const tools: string[] = [];
    const toolPattern = /(?:created|registered|new tool):?\s*(\w+)/gi;
    let match;
    while ((match = toolPattern.exec(output)) !== null) {
      if (match[1]) tools.push(match[1]);
    }
    return tools;
  }

  async executeWithPrompt(
    systemPrompt: string,
    task: string,
    timeoutMs: number = 600000
  ): Promise<PiTaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PiExecutor] Executing with system prompt (model: ${this.defaultModel})`);

      const { stdout, stderr } = await execSafe(
        this.piPath,
        ['--system-prompt', systemPrompt, '--print', task],
        { timeout: timeoutMs, env: { ...process.env, ...this.env } },
      );

      const durationMs = Date.now() - startTime;

      const output = stdout || stderr;
      const success =
        !output.toLowerCase().includes('error') && !output.toLowerCase().includes('failed');

      return {
        success,
        output,
        message: success ? 'Task completed successfully with system prompt' : output.substring(0, 500),
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(`[PiExecutor] Failed with system prompt: ${errorMessage}`);

      return {
        success: false,
        output: errorMessage,
        message: errorMessage,
        durationMs,
      };
    }
  }
}

let piExecutorInstance: PiExecutor | null = null;

export function getPiExecutor(config?: PiConfig): PiExecutor {
  if (!piExecutorInstance) {
    piExecutorInstance = new PiExecutor(config);
  }
  return piExecutorInstance;
}
```

---

## Changes Summary

| What Changed | Why |
|---|---|
| `import { exec } from 'child_process'` + `promisify(exec)` | → `import { spawn } from 'child_process'` | `exec` spawns a shell; `spawn` with `{ shell: false }` does not |
| String interpolation: `` `${cmd} "${arg}"` `` | → Array: `[cmd, '--flag', arg]` | OS kernel enforces arg boundaries; no escaping possible |
| `taskDescription.replace(/"/g, '\\"')` | → Removed entirely | No longer needed when using argument arrays |
| New `execSafe()` helper | Wraps `spawn` in a Promise with proper cleanup | Replaces `execAsync` behavior (timeout, env passthrough) |

## Methods Affected (3 total)

| Method | Old Pattern (line ~) | New Pattern |
|--------|---------------------|-------------|
| `execute()` | `execAsync(\`\${path} --print "\${desc}"\`)` | `execSafe(path, ['execute', '--model', m, '--print', desc])` |
| `executeJson()` | same + `'--mode json'` | same + `'--mode', 'json'` |
| `executeWithPrompt()` | `--system-prompt` + `--print` as strings | both passed as separate args |

---

## For Nupi

After fixing nezha:
1. Check if `nupi/src/services/PiExecutor.ts` is an **independent copy** or just re-exports from nezha
2. If it's its own copy → apply the **same replacement**
3. If it imports/re-exports from `@nezha/...` → **no changes needed**, fix propagates via dependency

Check with: `grep -n "from.*nezha" nupi/src/services/PiExecutor.ts`
