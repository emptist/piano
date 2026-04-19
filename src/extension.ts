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
  console.log('[Piano] Processing thinking request...');
  
  // Lazy init ACP on first use
  if (!acpInitPromise) {
    console.log('[Piano] Initializing ACP for first use...');
    acpInitPromise = initACP();
  }

  try {
    await acpInitPromise;
    console.log('[Piano] ACP init complete');
  } catch (e) {
    console.log('[Piano] ACP init failed:', e);
  }

  if (!acpClient) {
    console.log('[Piano] No ACP client - using fallback mode');
    return `External thinker (OpenCode ACP) not available. Question: ${question.substring(0, 100)}`;
  }

  try {
    console.log(`[Piano→OpenCode] Sending: "${question.slice(0, 100)}${question.length > 100 ? '...' : ''}"`);
    const result = await acpClient.think(question);
    console.log(`[Piano←OpenCode] Got response (${result.length} chars)`);
    return result;
  } catch (e) {
    console.error('[Piano→OpenCode] Failed:', e);
    return `OpenCode error: ${e}`;
  }
}

async function initACP() {
  console.log('[Piano] Starting ACP client...');
  acpClient = new OpenCodeACPClient(process.cwd());
  await acpClient.start();
  console.log('[Piano] ACP client ready');
}

setExternalThinker(opencodeThink);
console.log('[Piano] External thinker registered (NUPI_BYSELF=false)');

const pianoThinkTool = {
  name: "piano_think",
  label: "Piano Think",
  description: "Route complex reasoning to OpenCode for deeper analysis",
  parameters: Type.Object({
    context: Type.String({ description: "Current situation" }),
    question: Type.String({ description: "What needs deep thought" }),
  }),
  async execute(_id: any, params: any) {
    console.log('[Piano] Tool: piano_think called');
    const result = await opencodeThink(params.question);
    return {
      content: [{ type: "text", text: result }],
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
    console.log('[Piano] Tool: nezha_get_tasks called');
    const args = ["tasks", "--status", params.status || "PENDING", "--json"];
    const result = await execNezha(args);
    if (!result) {
      return { content: [{ type: "text", text: "Failed to get tasks" }], details: {} };
    }
    try {
      const tasks = JSON.parse(result);
      if (!tasks.length) {
        return { content: [{ type: "text", text: "No tasks" }], details: {} };
      }
      const lines = tasks.slice(0, params.limit || 10).map((t: any, i: number) => 
        `${i + 1}. [P${t.priority}] ${t.title} (${t.status})`
      );
      return { content: [{ type: "text", text: lines.join("\n") }], details: {} };
    } catch {
      return { content: [{ type: "text", text: "Failed to parse tasks" }], details: {} };
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
    console.log('[Piano] Tool: nezha_create_task called');
    const args = ["task-add", params.title];
    if (params.description) args.push(params.description);
    if (params.priority) args.push("--priority", String(params.priority));
    const result = await execNezha(args);
    if (!result) {
      return { content: [{ type: "text", text: "Failed to create task" }], details: {} };
    }
    return { content: [{ type: "text", text: `Task created: ${params.title}` }], details: {} };
  },
};

export default function pianoExtension(pi: any) {
  console.log('[Piano] Registering extension...');
  nupiExtension(pi);
  pi.registerTool(nezhaGetTasksTool);
  pi.registerTool(nezhaCreateTaskTool);
  pi.registerTool(pianoThinkTool);
  console.log('[Piano] Tools registered: nezha_get_tasks, nezha_create_task, piano_think');
  
  // AI-first startup: trigger OpenCode to review project
  // This is proper autonomous behavior - understand first, then act
  console.log('[Piano] Triggering startup AI review...');
  setTimeout(async () => {
    const startupPrompt = `You are Piano AI. On startup, review this project to understand context:
1. Read AGENTS.md if exists
2. Read README.md if exists  
3. Run: nezha tasks --status PENDING
4. Run: nezha issue-list
5. Analyze the project state

Then save a learning: nezha areflect "[LEARN] insight: Project X has N tasks, M issues, key focus is Y"

This is AI-first startup - understand before acting.`;
    
    const result = await opencodeThink(startupPrompt);
    console.log('[Piano] Startup review complete:', result.slice(0, 200) + '...');
  }, 5000); // Wait 5 seconds for Pi to fully initialize
}