import { execSync } from 'child_process';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type { ExtensionAPI };

const NEZHA_PATH = process.env.NEZHA_BIN || (() => {
  try {
    return execSync('which nezha', { encoding: 'utf-8' }).trim();
  } catch {
    return 'nezha';
  }
})();

export function runNezha(command: string, options?: { timeout?: number }): string {
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
