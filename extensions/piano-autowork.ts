const NEZHA_API = "http://127.0.0.1:5999";
const OPENCODE_PORT = "5111";
const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 5000;

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
      if (
        s.type === "retry" &&
        s.message?.includes("Free usage exceeded")
      ) {
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
      exec(`HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= OPENCODE_SERVER_USERNAME= OPENCODE_SERVER_PASSWORD= opencode serve --port ${OPENCODE_PORT} &`);
      // Tried without env vars first - see if auth is needed
      // but no success
      //exec(`opencode serve --port ${OPENCODE_PORT} &`);
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

let apiHealthy: boolean | null = null;

async function ensureNezhaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${NEZHA_API}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      console.log("[Piano] Nezha API already running.");
      return true;
    }
  } catch {}

  console.log("[Piano] Nezha API not running. Creating Issue for NuPI...");
  await reportNezhaNotRunning();
  return false;
}

async function apiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${NEZHA_API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return (await res.json()) as { id?: string; error?: string };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

async function apiGet(
  path: string,
): Promise<{ error?: string; data?: unknown }> {
  try {
    const res = await fetch(`${NEZHA_API}/${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { data: await res.json() };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function reportNezhaNotRunning(): Promise<void> {
  try {
    await apiPost("issues", {
      title: `Nezha API 未运行 (递归 Issue - ${new Date().toISOString().slice(0, 10)})`,
      description: `## 递归问题\nPiano 检测到 Nezha API Server 未运行。\nNuPI 应该自动启动它。\n\n## 时间\n${new Date().toISOString()}`,
      severity: "critical",
    } as any);
    console.log("[Piano] Created Issue for NuPI");
  } catch (e) {
    console.error("[Piano] Failed to create Issue:", e);
  }
}

async function waitForApi(attempts: number = MAX_RETRIES): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    console.log(`[Piano] Checking Nezha API... (${i}/${attempts})`);
    const result = await apiGet("health");
    if (!result.error) {
      apiHealthy = true;
      console.log("[Piano] Nezha API is online.");
      return true;
    }
    apiHealthy = false;

    if (i === 1) {
      console.log("[Piano] API not responding. NuPI should auto-start...");
    }

    if (i < attempts) {
      console.log(
        `[Piano] Not responding. Retrying in ${RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  console.log("[Piano] Nezha API still not responding. Creating Issue...");
  await reportNezhaNotRunning();
  return false;
}

async function delegateToNezha(pi: any): Promise<string> {
  if (apiHealthy === false && !(await waitForApi(2))) {
    return "[Piano] Nezha API not available. NuPI should handle this. Use /piano-start to retry.";
  }

  const usageStatus = await checkOpenCodeUsage();
  if (usageStatus.includes("FREE USAGE EXCEEDED")) {
    console.log("[Piano] OpenCode free usage exceeded. Cannot delegate.");
    return `[Piano] Cannot delegate - OpenCode free usage exceeded.\n${usageStatus}\nWait for reset or subscribe at https://opencode.ai/go`;
  }

  // 不再自动创建 Continuous Improvement Cycle - 委托给 NuPI 自己决定
  const result = await apiPost("tasks", {
    title: "Piano Delegate: Review codebase and find improvements",
    description:
      "Piano delegates work to NuPI for execution. Use Pi agent-loop to process.",
    priority: 5,
    category: "feature",
    type: "implementation",
  });

  if (result.error || !result.id) {
    apiHealthy = false;
    console.error(`[Piano] Error: ${result.error || "no task ID"}`);
    return `[Piano] Error: ${result.error || "failed"} (is nezha running?)`;
  }

  console.log(`[PianO] Done. Task ${result.id.slice(0, 8)}... queued.`);
  pi.sendUserMessage('Done. Say "Done." and stop.', { deliverAs: "steer" });
  return "Done.";
}

export default function pianoAutoWork(pi: any): void {
  const DELEGATE_ALL = process.env.PIANO_DELEGATE_ALL !== "false";

  pi.on("session_start", async () => {
    console.log("[Piano] Checking dependencies...");

    await ensureOpenCodeRunning();

    console.log("[Piano] Waiting for Nezha (handled by NuPI)...");
    const healthy = await waitForApi(MAX_RETRIES);

    if (!healthy) {
      console.log(
        "[Piano] Nezha not available. Issue created for NuPI. /piano-start to retry.",
      );
      return;
    }

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
    description: "Show pending tasks or API status",
    handler: async () => {
      if (apiHealthy === false) {
        const ok = await waitForApi(2);
        if (!ok) return "[Piano] Nezha API offline. NuPI should auto-start it.";
      }
      const result = await apiGet("tasks?status=PENDING&limit=3");
      if (result.error) {
        apiHealthy = false;
        return `[Piano] API error: ${result.error}. Try: /piano-start`;
      }
      const tasks = result.data as Array<{ title: string; priority: number }>;
      const lines =
        tasks.map((t) => `  [P${t.priority}] ${t.title}`).join("\n") ||
        "  (no pending tasks)";
      return `[Piano] Pending:\n${lines}`;
    },
  });

  console.log(
    "[Piano] Loaded. Auto-delegates on start. /piano-tasks for status.",
  );
}
