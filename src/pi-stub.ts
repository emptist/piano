// Pi Coding Agent Stub Types (for type checking only)
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute(
    toolCallId: unknown,
    params: Record<string, unknown>,
  ): Promise<ToolResult>;
}

// Stub functions - will be replaced by actual SDK at runtime
export const defineTool = (config: ToolDefinition): ToolDefinition => config;
export const createAgentSession = async (options?: unknown) => ({
  session: { prompt: async () => {}, subscribe: () => () => {} },
});
export const SessionManager = {
  inMemory: () => ({}),
  create: () => ({}),
  open: () => ({}),
};
export const AuthStorage = { create: () => ({}) };
export const ModelRegistry = { create: (_a: unknown) => ({}) };
