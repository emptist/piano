/**
 * ACP Client for Piano
 *
 * Communicates with OpenCode ACP server via stdio (ND-JSON)
 * Following official ACP protocol and Zed's implementation pattern
 */

import { spawn, type ChildProcess } from "child_process";
import {
  type InitializeResponse,
} from "@agentclientprotocol/sdk";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface OpenCodeACPClientOptions {
  cwd?: string;
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  pure?: boolean;
  printLogs?: boolean;
  verbose?: boolean;
}

export class OpenCodeACPClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private buffer = "";  // Accumulate partial JSON
  private sessionId: string | null = null;
  private initialized = false;

  constructor(
    private cwd: string = process.cwd(),
    private options: OpenCodeACPClientOptions = {},
  ) {}

  async start(): Promise<void> {
    const args = ["acp", "--cwd", this.cwd];

    if (this.options.logLevel) {
      args.push("--log-level", this.options.logLevel);
    }
    if (this.options.pure) {
      args.push("--pure");
    }
    if (this.options.printLogs) {
      args.push("--print-logs");
    }

    return new Promise((resolve, reject) => {
      this.process = spawn("opencode", args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        // OpenCode stderr - can be verbose, but useful for debugging
      });

      this.process.on("error", (error) => {
        reject(error);
      });

      this.process.on("exit", (code) => {
        // Process exited
      });

      setTimeout(async () => {
        try {
          await this.initialize();
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 1500);
    });
  }

  private handleMessage(data: string): void {
    // Accumulate partial JSON across multiple chunks
    this.buffer += data;
    
    // Try to extract and parse complete JSON objects
    while (this.buffer.length > 0) {
      const trimmed = this.buffer.trim();
      
      // Skip non-JSON lines (logs, etc.)
      if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        // Find the next { or [ to start from
        const jsonStart = trimmed.search(/[\[{]/);
        if (jsonStart === -1) {
          // No JSON found, clear buffer
          this.buffer = "";
          break;
        }
        this.buffer = trimmed.slice(jsonStart);
        continue;
      }
      
      // Try to parse
      try {
        // Find matching closing bracket
        const msg = JSON.parse(this.buffer);
        this.processMessage(msg);
        // Clear buffer after successful parse
        this.buffer = "";
      } catch (e) {
        // Incomplete JSON - wait for more data
        // Keep buffer as-is and wait for next chunk
        break;
      }
    }
  }

  private processMessage(msg: any): void {
    // Existing message handling logic
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id)!;
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
      this.pendingRequests.delete(msg.id);
    }
    // Handle notifications (no id)
    else if (msg.method && !msg.id) {
      this.handleNotification(msg);
    }
  }

  private handleNotification(msg: unknown): void {
    if (this.options.verbose) {
      console.log("[OpenCode ACP] Notification:", msg);
    }
  }

  private async sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error("OpenCode ACP process not running");
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  async initialize(): Promise<InitializeResponse> {
    const result = (await this.sendRequest("initialize", {
      protocolVersion: 1,
      capabilities: {
        // Auto-approve permissions for now
      },
    })) as InitializeResponse;

    this.initialized = true;
    return result;
  }

  async newSession(params: {
    cwd: string;
    mcpServers?: unknown[];
  }): Promise<string> {
    const result = (await this.sendRequest("session/new", {
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
    })) as { sessionId: string };

    this.sessionId = result.sessionId;
    return result.sessionId;
  }

  async readTextFile(params: { path: string }): Promise<{ content: string }> {
    return (await this.sendRequest(
      "fs/read_text_file",
      params,
    )) as { content: string };
  }

  async writeTextFile(params: {
    path: string;
    content: string;
  }): Promise<{ ok: boolean }> {
    return (await this.sendRequest(
      "fs/write_text_file",
      params,
    )) as { ok: boolean };
  }

  async prompt(
    sessionId: string,
    prompt: Array<{ type: string; text: string }>,
  ): Promise<unknown> {
    if (!sessionId) {
      throw new Error("No session available");
    }

    const result = await this.sendRequest("session/prompt", {
      sessionId,
      prompt,
    });

    return result;
  }

  async think(question: string): Promise<string> {
    if (!this.sessionId) {
      // Create a new session if none exists
      await this.newSession({ cwd: this.cwd, mcpServers: [] });
    }

    const response = await this.prompt(this.sessionId!, [
      {
        type: "text",
        text: question,
      },
    ]);

    // Extract text content from response - check for message.content
    const msg = response as {
      message?: { content?: Array<{ type: string; text?: string }> };
    };
    const textContent = msg.message?.content?.find((c) => c.type === "text");
    return textContent?.text ?? JSON.stringify(response);
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.process = null;
    this.sessionId = null;
    this.initialized = false;
  }
}
