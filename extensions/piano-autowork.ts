import { getNuPIClient } from "@nezha/nupi";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const OPENCODE_PORT = "5111";

let openCodePort: string | null = null;

function getOpenCodePort(): string {
  return openCodePort || OPENCODE_PORT;
}

function findOpenCodeProcess(): { pid: number; port: string } | null {
  try {
    const { execSync } = require("child_process");
    const result = execSync(
      `pgrep -f "opencode.*serve.*--port.*${OPENCODE_PORT}" -l`,
      { encoding: "utf8" },
    );
    const match = result.match(/(\d+)/);
    if (match) {
      const pid = parseInt(match[1], 10);
      const lsof = execSync(`lsof -i -P -n | grep ${pid} | grep LISTEN`, {
        encoding: "utf8",
      });
      const portMatch = lsof.match(/:(\d+)\s/);
      if (portMatch) {
        openCodePort = portMatch[1];
        return { pid, port: portMatch[1] };
      }
    }
  } catch {}
  return null;
}

async function testOpenCodeAccessible(): Promise<boolean> {
  try {
    const port = getOpenCodePort();
    const res = await fetch(`http://127.0.0.1:${port}/session`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

async function checkOpenCodeUsage(): Promise<string> {
  try {
    const port = getOpenCodePort();
    const res = await fetch(`http://127.0.0.1:${port}/session/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `Status check failed: HTTP ${res.status}`;
    const data = (await res.json()) as Record<
      string,
      { type?: string; message?: string; next?: number }
    >;
    const entries = Object.entries(data);
    if (entries.length === 0) return "No active sessions (idle).";
    const lines = entries.map(([id, s]) => {
      const shortId = id.slice(0, 12);
      if (s.type === "retry" && s.message?.includes("Free usage exceeded")) {
        const resetTime = s.next
          ? new Date(s.next).toLocaleTimeString()
          : "unknown";
        return `  ${shortId}: FREE USAGE EXCEEDED (resets ${resetTime})`;
      }
      return `  ${shortId}: ${s.type || "unknown"} - ${(s.message || "").slice(0, 60)}`;
    });
    return lines.join("\n");
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function startOpenCode(): Promise<boolean> {
  try {
    console.log("[Piano] Starting OpenCode Server...");
    const { exec } = require("child_process");

    return new Promise((resolve) => {
      exec(
        `nohup sh -c 'HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= OPENCODE_SERVER_USERNAME= OPENCODE_SERVER_PASSWORD= opencode serve --port ${OPENCODE_PORT}' > /tmp/piano-opencode.log 2>&1 &`,
      );
      setTimeout(async () => {
        if (await testOpenCodeAccessible()) {
          console.log(`[Piano] OpenCode started on port ${OPENCODE_PORT}.`);
          resolve(true);
        } else {
          console.error("[Piano] OpenCode failed to start.");
          resolve(false);
        }
      }, 3000);
    });
  } catch (e) {
    console.error("[Piano] Failed to start OpenCode:", e);
    return false;
  }
}

async function ensureOpenCodeRunning(): Promise<boolean> {
  const existing = findOpenCodeProcess();

  if (existing && (await testOpenCodeAccessible())) {
    openCodePort = existing.port;
    console.log(
      `[Piano] Using existing OpenCode (pid: ${existing.pid}, port: ${existing.port}).`,
    );
    return true;
  }

  if (existing) {
    console.log(
      "[Piano] Existing OpenCode not accessible (auth?), starting own instance...",
    );
  } else {
    console.log("[Piano] OpenCode not running. Starting...");
  }

  return await startOpenCode();
}

function cleanupOpenCode(): void {
  // Using exec() with & - can't track PID, let system handle cleanup
  console.log("[Piano] OpenCode cleanup (handled by system).");
}

process.on("exit", cleanupOpenCode);

function runNezha(args: string): string {
  try {
    return require("child_process").execSync(`nezha ${args}`, {
      timeout: 5000,
      encoding: "utf-8",
    });
  } catch (error) {
    return "";
  }
}

// 2026-04-14: No apiHealthy tracking needed!
// We use CLI directly, don't care about HTTP server status

// 使用 CLI 直接创建任务
const output = runNezha(
    'task-add "Piano Delegate: Review codebase and find improvements" "Piano delegates work to NuPI for execution. Use Pi agent-loop to process." --priority 5',
  );

  const match = output.match(/([a-f0-9-]{36})/);
  if (!match) {
    console.error(`[Piano] Error creating task: ${output}`);
    return `[Piano] Error: ${output.slice(0, 100)}`;
  }

  console.log(`[Piano] Done. Task ${match[1].slice(0, 8)}... queued.`);
  pi.sendUserMessage('Done. Say "Done." and stop.', { deliverAs: "steer" });
  return "Done.";
}

export default function pianoAutoWork(pi: any): void {
  const DELEGATE_ALL = process.env.PIANO_DELEGATE_ALL !== "false";

  pi.on("session_start", async () => {
    console.log("[Piano] Checking dependencies...");

    await ensureOpenCodeRunning();

    // 2026-04-14: No need to wait for Nezha HTTP API!
    // NuPI uses CLI directly, no dependency on HTTP server

    if (DELEGATE_ALL) {
      console.log("[Piano] Auto-delegating to Nezha/OpenCode...");
      await delegateToNezha(pi);
    } else {
      console.log(
        "[Piano] Autonomous mode. /piano-start to delegate, /piano-tasks for tasks.",
      );
    }
  });

  pi.registerCommand("piano-start", {
    description: "Delegate work to Nezha/OpenCode (with retry)",
    handler: async () => delegateToNezha(pi),
  });

  pi.registerCommand("piano-usage", {
    description: "Check OpenCode free usage status",
    handler: async () => checkOpenCodeUsage(),
  });

  pi.registerCommand("piano-tasks", {
    description: "Show pending tasks via CLI",
    handler: async () => {
      const output = runNezha("tasks --status PENDING --limit 3");
      if (!output || output.includes("no tasks")) {
        return "[Piano] No pending tasks.";
      }
      return `[Piano] Pending:\n${output}`;
    },
  });

  console.log(
    "[Piano] Loaded. Auto-delegates on start. /piano-tasks for status.",
  );
}
