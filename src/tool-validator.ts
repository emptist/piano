import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true });

export const TOOL_SCHEMAS: Record<string, object> = {
  edit: {
    type: "object",
    properties: {
      path: { type: "string" },
      edits: { 
        type: "array",
        items: { type: "object" }
      },
    },
    required: ["path", "edits"],
    additionalProperties: false,
  },
  write: {
    type: "object",
    properties: {
      content: { type: "string" },
      filePath: { type: "string" },
    },
    required: ["content", "filePath"],
    additionalProperties: false,
  },
  read: {
    type: "object",
    properties: {
      filePath: { type: "string" },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
  glob: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  grep: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      include: { type: "string" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  bash: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "number" },
      workdir: { type: "string" },
      description: { type: "string" },
    },
    required: ["command", "description"],
    additionalProperties: false,
  },
  todowrite: {
    type: "object",
    properties: {
      todos: { type: "array" },
    },
    required: ["todos"],
    additionalProperties: false,
  },
  task: {
    type: "object",
    properties: {
      description: { type: "string" },
      prompt: { type: "string" },
      subagent_type: { type: "string" },
      task_id: { type: "string" },
    },
    required: ["description", "prompt", "subagent_type"],
    additionalProperties: false,
  },
  websearch: {
    type: "object",
    properties: {
      query: { type: "string" },
      numResults: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  webfetch: {
    type: "object",
    properties: {
      url: { type: "string" },
      format: { type: "string" },
      timeout: { type: "number" },
    },
    required: ["url"],
    additionalProperties: false,
  },
  codesearch: {
    type: "object",
    properties: {
      query: { type: "string" },
      tokensNum: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const validators: Record<string, any> = {};
for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
  validators[name] = ajv.compile(schema);
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateToolCall(toolName: string, params: unknown): ValidationResult {
  const validator = validators[toolName];
  if (!validator) {
    return { valid: true, errors: [] }; // Unknown tool, skip validation
  }

  const valid = validator(params);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = validator.errors?.map(
    (e: any) => `${e.instancePath || "/"}: ${e.message || "unknown error"}`
  ) ?? ["unknown validation error"];

  return { valid: false, errors };
}

export function formatToolError(toolName: string, params: unknown): string {
  const result = validateToolCall(toolName, params);
  if (result.valid) {
    return "";
  }
  return `${toolName}: ${result.errors.join(", ")}`;
}