import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { spawn, type ChildProcess } from "child_process";

const DEFAULT_PORT = 4096;
const OPENCODE_PORT = parseInt(process.env.OPENCODE_PORT || String(DEFAULT_PORT), 10);

const logBuffer: string[] = [];
let enableLogging = false;

function log(msg: string) {
  const fullMsg = "[OpenCode Serve] " + msg + "\n";
  logBuffer.push(fullMsg);
  if (enableLogging) {
    console.log(fullMsg.trim());
  }
}

function clearLogs() {
  logBuffer.length = 0;
}

function getLogs(): string {
  const result = logBuffer.join("\n");
  clearLogs();
  return result;
}

function enableLogs() {
  enableLogging = true;
}

function disableLogs() {
  enableLogging = false;
}

let client: OpencodeClient | null = null;
let serverPort: number | null = null;
let serverProcess: ChildProcess | null = null;

export async function startOpenCodeServer(): Promise<number> {
  if (serverPort) return serverPort;

  log("Starting server on port " + OPENCODE_PORT + "...");
  serverPort = OPENCODE_PORT;
  
  serverProcess = spawn("opencode", ["serve", "--port", String(OPENCODE_PORT)], {
    stdio: ["pipe", "ignore", "ignore"],
  });

  return Promise.resolve(OPENCODE_PORT);
}

export async function getOpenCodeClient(): Promise<OpencodeClient> {
  if (client) return client;

  const port = await startOpenCodeServer();
  client = createOpencodeClient({
    baseUrl: `http://127.0.0.1:${port}`,
  });

  return client;
}

export async function opencodeThink(question: string): Promise<string> {
  enableLogs();
  log("Thinking: " + question.slice(0, 50));
  
  const sdk = await getOpenCodeClient();
  log("Got SDK, listing sessions...");

  try {
    // Always create fresh session to avoid stale state
    log("Creating new session...");
    const createdResult = await sdk.session.create({});
    const createData = (createdResult as any).data;
    const sessionID = createData?.["200"]?.id ?? "";
    if (!sessionID) {
      return getLogs() + "\nFailed to create session";
    }
    log("Created: " + sessionID);

    log("Prompting...");
    const promptResult = await sdk.session.prompt({
      sessionID,
      parts: [{ type: "text", text: question }],
    });
    log("Got response");

    const data = (promptResult as any).data;
    const response = (promptResult as any).response;
    if (!data && !response) {
      log("Raw response: " + JSON.stringify(promptResult));
      return getLogs() + "\nNo data in response";
    }
    
    const info = data?.info || response?.info;
    if (info) {
      const summary = info.summary;
      if (summary) {
        return getLogs() + "\nAnalysis: " + JSON.stringify(summary).slice(0, 300);
      }
      return getLogs() + "\nAgent: " + info.agent + ", Mode: " + info.mode + ", Tokens: " + JSON.stringify(info.tokens);
    }
    
    return getLogs() + "\n" + JSON.stringify(data).slice(0, 500);
  } catch (e: any) {
    return getLogs() + "\nError: " + (e.message ?? e);
  } finally {
    disableLogs();
  }
}

export function stopOpenCodeServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    serverPort = null;
    client = null;
  }
}