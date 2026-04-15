// Piano - Thinking Router
// Combines NuPI tools + routes thinking to OpenCode

import { Type } from "@sinclair/typebox";

interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    toolCallId: unknown,
    params: Record<string, unknown>,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    details: Record<string, unknown>;
  }>;
}

// Piano Think tool
const pianoThinkTool: ToolDefinition = {
  name: "piano_think",
  label: "Piano Think",
  description: "Take complex thinking from Pi, route to OpenCode",
  parameters: Type.Object({
    context: Type.String({ description: "Current situation" }),
    question: Type.String({ description: "What needs deep thought" }),
  }),
  async execute(_toolCallId: unknown, params: Record<string, unknown>) {
    return {
      content: [{ type: "text", text: `[Piano→OpenCode] ${params.question}` }],
      details: { action: "route_to_opencode" },
    };
  },
};

export { pianoThinkTool };
export type { ToolDefinition };
