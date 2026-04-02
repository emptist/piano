import { execSync } from 'child_process';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export type { ExtensionAPI };

const NEZHA_PATH = process.env.NEZHA_BIN || '/opt/homebrew/bin/nezha';

export function runNezha(command: string, options?: { timeout?: number }): string {
  try {
    return execSync(`node ${NEZHA_PATH} ${command}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: options?.timeout,
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return err.stdout || err.stderr || err.message || String(e);
  }
}
