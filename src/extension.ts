import { Type } from "@sinclair/typebox";
import { nupiExtension, setExternalThinker } from "@nezha/nupi";
import { OpenCodeACPClient } from "./opencode-acp";

function execNezha(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const { execSync } = require("child_process");
    try {
      const result = execSync(`nezha ${args.join(" ")}`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      resolve(result);
    } catch {
      resolve(null);
    }
  });
}

let acpClient: OpenCodeACPClient | null = null;
let acpInitPromise: Promise<void> | null = null;

async function opencodeThink(question: string): Promise<string> {
  // Lazy init ACP on first use
  if (!acpInitPromise) {
    acpInitPromise = initACP();
  }

  try {
    await acpInitPromise;
  } catch (e) {
    // ACP init failed, continue without it
  }

  if (!acpClient) {
    return `External thinker (OpenCode ACP) not available. Question: ${question.substring(0, 100)}`;
  }

  try {
    console.log("[Piano→OpenCode] Delegating thinking request...");
    const result = await acpClient.think(question);
    console.log("[Piano→OpenCode] Received response");
    return result;
  } catch (e) {
    console.error("[Piano→OpenCode] Error:", e);
    return `OpenCode error: ${e}`;
  }
}

setExternalThinker(opencodeThink);

async function initACP() {
  try {
    acpClient = new OpenCodeACPClient(process.cwd());
    await acpClient.start();
  } catch (e) {
    // ACP failed to start - will use fallback
    acpClient = null;
  }
}

async function checkStartupTasks(): Promise<string> {
  const result = await execNezha(["tasks", "--status", "PENDING", "--json"]);
  if (!result) return "Could not check tasks";

  try {
    // Handle both JSON and text output
    let tasks;
    try {
      tasks = JSON.parse(result);
    } catch {
      // If not JSON, check for "No tasks" or other text
      if (
        result.includes("No tasks") ||
        result.includes("=== PENDING TASKS ===")
      ) {
        return "📋 No pending tasks";
      }
      return "📋 " + result.split("\n")[0];
    }

    if (!Array.isArray(tasks) || tasks.length === 0)
      return "📋 No pending tasks";

    const highPriority = tasks.filter((t: any) => t.priority >= 8);
    if (highPriority.length > 0) {
      return `🎯 ${highPriority.length} high-priority tasks:\n${highPriority
        .slice(0, 3)
        .map((t: any) => `- ${t.title?.slice(0, 50)}`)
        .join("\n")}`;
    }
    return `📋 ${tasks.length} tasks pending`;
  } catch {
    return "Failed to parse tasks";
  }
}

const pianoThinkTool = {
  name: "piano_think",
  label: "Piano Think",
  description: "Route complex reasoning to OpenCode for deeper analysis",
  parameters: Type.Object({
    context: Type.String({ description: "Current situation" }),
    question: Type.String({ description: "What needs deep thought" }),
  }),
  async execute(_id: any, params: any) {
    return {
      content: [
        {
          type: "text",
          text: `[Piano→OpenCode] Thinking: ${params.question}`,
        },
      ],
      details: { action: "route_to_opencode" },
    };
  },
};

const nezhaGetTasksTool = {
  name: "nezha_get_tasks",
  label: "Nezha Get Tasks",
  description: "Get pending tasks from Nezha database",
  parameters: Type.Object({
    status: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
  }),
  async execute(_id: any, params: any) {
    const args = ["tasks", "--status", params.status || "PENDING", "--json"];
    const result = await execNezha(args);
    if (!result) {
      return {
        content: [{ type: "text", text: "Failed to get tasks" }],
        details: {},
      };
    }
    try {
      const tasks = JSON.parse(result);
      if (!tasks.length) {
        return { content: [{ type: "text", text: "No tasks" }], details: {} };
      }
      const lines = tasks
        .slice(0, params.limit || 10)
        .map(
          (t: any, i: number) =>
            `${i + 1}. [P${t.priority}] ${t.title} (${t.status})`,
        );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {},
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to parse tasks" }],
        details: {},
      };
    }
  },
};

const nezhaCreateTaskTool = {
  name: "nezha_create_task",
  label: "Nezha Create Task",
  description: "Create a new task in Nezha",
  parameters: Type.Object({
    title: Type.String(),
    description: Type.Optional(Type.String()),
    priority: Type.Optional(Type.Number()),
  }),
  async execute(_id: any, params: any) {
    const args = ["task-add", params.title];
    if (params.description) args.push(params.description);
    if (params.priority) args.push("--priority", String(params.priority));
    const result = await execNezha(args);
    if (!result) {
      return {
        content: [{ type: "text", text: "Failed to create task" }],
        details: {},
      };
    }
    return {
      content: [{ type: "text", text: `Task created: ${params.title}` }],
      details: {},
    };
  },
};

const startupCheckTool = {
  name: "piano_startup_check",
  label: "Piano Startup Check",
  description: "Check pending tasks on startup",
  parameters: Type.Object({}),
  async execute() {
    const status = await checkStartupTasks();
    return {
      content: [{ type: "text", text: status }],
      details: {},
    };
  },
};

export default async function pianoExtension(pi: any) {
  nupiExtension(pi);
  pi.registerTool(nezhaGetTasksTool);
  pi.registerTool(nezhaCreateTaskTool);
  pi.registerTool(pianoThinkTool);
  pi.registerTool(startupCheckTool);

  // Run startup check immediately
  const status = await checkStartupTasks();
  console.log(`[Piano Startup] ${status}`);
}
