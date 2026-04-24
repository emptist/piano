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

async function isServerRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/session?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function startOpenCodeServer(): Promise<number> {
  if (serverPort && client) return serverPort;

  if (serverPort) {
    if (await isServerRunning(serverPort)) {
      log("Reusing existing server on port " + serverPort);
      client = createOpencodeClient({
        baseUrl: `http://127.0.0.1:${serverPort}`,
      });
      if (await verifySDKReady(client)) {
        return serverPort;
      }
    }
  }
  
  serverPort = OPENCODE_PORT;

  log("Starting server on port " + OPENCODE_PORT + "...");
  
  serverProcess = spawn("opencode", ["serve", "--port", String(OPENCODE_PORT)], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });

  serverProcess.unref();

  const maxAttempts = 30;
  const delayMs = 500;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/session?limit=1`);
      if (response.ok) {
        log("Server HTTP responding after " + ((i + 1) * delayMs) + "ms");
        break;
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  const sdkClient = createOpencodeClient({
    baseUrl: `http://127.0.0.1:${OPENCODE_PORT}`,
  });
  
  if (await verifySDKReady(sdkClient)) {
    client = sdkClient;
    return OPENCODE_PORT;
  }
  
  log("SDK warmup timeout, proceeding anyway...");
  client = sdkClient;
  return OPENCODE_PORT;
}

async function verifySDKReady(sdk: OpencodeClient): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try {
      const testSession = await sdk.session.create({});
      if (testSession.data?.id) {
        log("SDK fully ready after " + ((i + 1) * 500) + "ms, session: " + testSession.data.id);
        return true;
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return false;
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
    log("Creating new session...");
    const createdResult = await sdk.session.create({});
    log("Create result: " + JSON.stringify((createdResult as any).data).slice(0, 200));
    const createData = (createdResult as any).data;
    let sessionID = createData?.id ?? createData?.["200"]?.id ?? "";
    
    if (!sessionID) {
      log("Session creation failed, trying to list existing...");
      const sessionsResult = await sdk.session.list();
      const sessionData = (sessionsResult as any).data;
      const sessionList: any[] = Array.isArray(sessionData) ? sessionData : (sessionData?.["200"] ?? []);
      if (sessionList.length > 0) {
        sessionID = sessionList[0].id;
        log("Using existing: " + sessionID);
      }
    } else {
      log("Created: " + sessionID);
    }

    if (!sessionID) {
      disableLogs();
      return "Failed to create or find session";
    }

    log("Prompting with session: " + sessionID);
    const promptResult = await Promise.race([
      sdk.session.prompt({
        sessionID,
        parts: [{ type: "text", text: question }],
      }),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("Prompt timeout after 60s")), 60000)
      ),
    ]);
    
    if (!promptResult) {
      disableLogs();
      return "Prompt timed out";
    }
    log("Got response: " + JSON.stringify(promptResult).slice(0, 500));

    const data = (promptResult as any).data;
    const response = (promptResult as any).response;
    if (!data && !response) {
      log("Raw response: " + JSON.stringify(promptResult));
      disableLogs();
      return "No data in response: " + JSON.stringify(promptResult).slice(0, 300);
    }
    
    const info = data?.info || response?.info;
    const parts = data?.parts || response?.parts || [];
    
    log("Parts count: " + parts.length + ", info: " + !!info);
    
    const textParts = parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n");
    
    if (textParts) {
      disableLogs();
      return textParts;
    }
    
    if (info) {
      const summary = info.summary;
      if (summary) {
        disableLogs();
        return "Analysis: " + JSON.stringify(summary).slice(0, 300);
      }
      disableLogs();
      return "Agent: " + info.agent + ", Mode: " + info.mode + ", Tokens: " + JSON.stringify(info.tokens);
    }
    
    disableLogs();
    return JSON.stringify(data).slice(0, 500);
  } catch (e: any) {
    disableLogs();
    return "Error: " + (e.message ?? e);
  } finally {
    disableLogs();
  }
}

export function stopOpenCodeServer(): void {
  client = null;
  serverPort = null;
}