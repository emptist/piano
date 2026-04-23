import { Type } from "@sinclair/typebox";
import type {
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import { nupiExtension, registerThinker } from "@nezha/nupi";
import type { ExternalThinker } from "@nezha/nupi";
import { opencodeThink, stopOpenCodeServer } from "./opencode-serve.js";
import { validateToolCall, formatToolError, TOOL_SCHEMAS } from "./tool-validator.js";

const GIT_HASH = "@@GIT_HASH@@";

const pianoThinker: ExternalThinker = {
  name: "OpenCode",
  think: opencodeThink,
};

let piInstance: any = null;
let pendingMessages: string[] = [];

function notifyPi(message: string, type: "info" | "warning" | "error" = "info") {
  const log = `[Piano@${GIT_HASH}] ${message}`;
  if (piInstance?.ui?.notify) {
    piInstance.ui.notify(log, type);
  } else {
    console.log(log);
  }
}

function execNezha(args: string[]): Promise<string | null> {
  try {
    const result = execSync(`nezha ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    return Promise.resolve(result);
  } catch {
    return Promise.resolve(null);
  }
}

// Fetch startup prompt from database via nezha CLI
function getStartupPromptFromDB(): string | null {
  try {
    const result = execSync(
      `psql -h 127.0.0.1 -U jk -d nezha -t -c "SELECT suggested_prompt FROM prompt_suggestions WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 1;"`,
      { encoding: "utf-8", timeout: 5000 }
    );
    const prompt = result.trim();
    return prompt || null;
  } catch {
    return null;
  }
}

registerThinker(pianoThinker);

function validateOpenCodeTools(event: any): string | null {
  if (!event || event.type !== "tool_call") return null;
  const toolName = event.toolName;
  const params = event.input;
  const result = validateToolCall(toolName, params);
  if (!result.valid) {
    const errorMsg = `[Tool Validation] ${toolName}: ${result.errors.join(", ")}`;
    notifyPi(errorMsg, "warning");
    return errorMsg;
  }
  return null;
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
    notifyPi('[Piano] Tool: piano_think called');
    notifyPi('[Piano] Question: ' + params.question?.slice(0, 100) + '...');
    const result = await opencodeThink(params.question);
    notifyPi('[Piano] Response: ' + result?.slice(0, 100) + '...');
    return {
      content: [{ type: "text" as const, text: result }],
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
    notifyPi('[Piano] Tool: nezha_get_tasks called');
    const args = ["tasks", "--status", params.status || "PENDING", "--json"];
    const result = await execNezha(args);
    if (!result) {
      return { content: [{ type: "text" as const, text: "Failed to get tasks" }], details: {} };
    }
    try {
      const tasks = JSON.parse(result);
      if (!tasks.length) {
        return { content: [{ type: "text" as const, text: "No tasks" }], details: {} };
      }
      const lines = tasks.slice(0, params.limit || 10).map((t: any, i: number) => 
        `${i + 1}. [P${t.priority}] ${t.title} (${t.status})`
      );
      return { content: [{ type: "text" as const, text: lines.join("\n") }], details: {} };
    } catch {
      return { content: [{ type: "text" as const, text: "Failed to parse tasks" }], details: {} };
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
    notifyPi('[Piano] Tool: nezha_create_task called');
    const args = ["task-add", params.title];
    if (params.description) args.push(params.description);
    if (params.priority) args.push("--priority", String(params.priority));
    const result = await execNezha(args);
    if (!result) {
      return { content: [{ type: "text" as const, text: "Failed to create task" }], details: {} };
    }
    return { content: [{ type: "text" as const, text: `Task created: ${params.title}` }], details: {} };
  },
};

export default function pianoExtension(pi: ExtensionAPI) {
  piInstance = pi;
registerThinker(pianoThinker);
  notifyPi('[Piano] Thinking router ready (external mode)');
  nupiExtension(pi as any);
  pi.registerTool(pianoThinkTool as any);
  pi.registerTool(nezhaGetTasksTool as any);
  pi.registerTool(nezhaCreateTaskTool as any);
  notifyPi('[Piano] Tools registered: nezha_get_tasks, nezha_create_task, piano_think');
  
  // Tool validation: intercept and validate OpenCode tool calls
  pi.on("tool_call", (event: any) => {
    const error = validateOpenCodeTools(event);
    if (error) {
      return { block: true, reason: error };
    }
  });
  notifyPi('[Piano] Tool validator active');
  
  // Log available tool schemas at startup
  const toolCount = Object.keys(TOOL_SCHEMAS).length;
  notifyPi(`[Piano] ${toolCount} tool schemas loaded for validation`);
  
  // AI-first startup: trigger OpenCode to review project
  notifyPi('[Piano] Triggering startup AI review...');
  setTimeout(async () => {
    const dbPrompt = getStartupPromptFromDB();
    const defaultPrompt = `You are Piano AI - an autonomous AI developer working on this project.

On startup, your job is to:
1. Understand: Read AGENTS.md and README.md to know project goals
2. Check: Run "nezha tasks --status PENDING" and "nezha issue-list" 
3. Analyze: What needs to be done? What's broken? What's in progress?
4. Research: Search web for relevant skills/techniques
5. Report: Create issues for problems found
6. Work: Pick highest priority task and start working
7. Learn: Save insights with "nezha areflect"

This is AI-first startup - understand, find issues, create tasks, start working.`;
    
    const startupPrompt = dbPrompt || defaultPrompt;
    if (dbPrompt) {
      notifyPi('[Piano] Using startup prompt from database');
    } else {
      notifyPi('[Piano] Using default startup prompt');
    }
    
    notifyPi('[Piano] Sending startup review prompt to OpenCode...');
    const result = await opencodeThink(startupPrompt);
    notifyPi('[Piano] Startup review response: ' + result.slice(0, 500) + '...');
  }, 5000);
}