import { Type } from "@sinclair/typebox";

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
      return { content: [{ type: "text", text: "Failed to get tasks" }], details: {} };
    }
    try {
      const tasks = JSON.parse(result);
      if (!tasks.length) {
        return { content: [{ type: "text", text: "No tasks" }], details: {} };
      }
      const lines = tasks.slice(0, params.limit || 10).map(
        (t: any, i: number) =>
          `${i + 1}. [P${t.priority}] ${t.title} (${t.status})`,
      );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {},
      };
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
    const args = ["task-add", params.title];
    if (params.description) args.push(params.description);
    if (params.priority) args.push("--priority", String(params.priority));
    const result = await execNezha(args);
    if (!result) {
      return { content: [{ type: "text", text: "Failed to create task" }], details: {} };
    }
    return {
      content: [{ type: "text", text: `Task created: ${params.title}` }],
      details: {},
    };
  },
};

export default function pianoExtension(pi: any) {
  pi.registerTool(nezhaGetTasksTool);
  pi.registerTool(nezhaCreateTaskTool);
  pi.registerTool(pianoThinkTool);
}
