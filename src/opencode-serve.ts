import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { spawn, type ChildProcess } from "child_process";

function log(msg: string) {
  console.log("[OpenCode Serve] " + msg);
}

let client: OpencodeClient | null = null;
let serverPort: number | null = null;
let serverProcess: ChildProcess | null = null;

export async function startOpenCodeServer(): Promise<number> {
  if (serverPort) return serverPort;

  log("Starting server...");
  serverProcess = spawn("opencode", ["serve", "--port", "0"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  serverProcess.stdout?.on("data", (data: Buffer) => {
    output += data.toString();
    log("OUT: " + data.toString().slice(0, 100));
  });
  serverProcess.stderr?.on("data", (data: Buffer) => {
    log("ERR: " + data.toString().slice(0, 100));
  });

  return new Promise((resolve) => {
    let resolved = false;

    serverProcess!.stdout?.on("data", (data: Buffer) => {
      if (resolved) return;
      const str = data.toString();
      log("Server: " + str.slice(0, 100));
      const match = str.match(/listening on.*?:(\d+)/);
      if (match && match[1]) {
        serverPort = parseInt(match[1], 10);
        log("Port: " + serverPort);
        resolved = true;
        resolve(serverPort);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        log("Timeout, using default port 4096");
        serverPort = 4096;
        resolve(serverPort);
      }
    }, 8000);
  });
}

export async function getOpenCodeClient(): Promise<OpencodeClient> {
  if (client) return client;

  const port = await startOpenCodeServer();
  log("Creating client for port: " + port);
  client = createOpencodeClient({
    baseUrl: `http://127.0.0.1:${port}`,
  });

  return client;
}

export async function opencodeThink(question: string): Promise<string> {
  log("Thinking: " + question.slice(0, 50));
  const sdk = await getOpenCodeClient();
  log("Got SDK, listing sessions...");

  try {
    const sessionsResult = await sdk.session.list();
    log("Sessions: " + JSON.stringify(sessionsResult).slice(0, 100));
    const sessionData = (sessionsResult as any).data;
    const sessionList: any[] = Array.isArray(sessionData) ? sessionData : (sessionData?.["200"] ?? []);
    log("Found " + sessionList.length + " sessions");

    let sessionID: string = "";
    if (sessionList.length > 0) {
      sessionID = sessionList[0].id;
      log("Using: " + sessionID);
    } else {
      log("Creating new session...");
      const createdResult = await sdk.session.create({});
      const createData = (createdResult as any).data;
      sessionID = createData?.["200"]?.id ?? "";
      log("Created: " + sessionID);
    }

    if (!sessionID) {
      log("Failed: no session ID");
      return "Failed to create session";
    }

    log("Prompting...");
    const promptResult = await sdk.session.prompt({
      sessionID,
      parts: [{ type: "text", text: question }],
    });
    log("Got response");

    const data = (promptResult as any).data;
    if (!data) return "No data in response";
    
    // Try to extract assistant message
    const info = data?.info;
    if (info) {
      const summary = info.summary;
      if (summary) {
        return "Analysis: " + JSON.stringify(summary).slice(0, 300);
      }
      return "Agent: " + info.agent + ", Mode: " + info.mode + ", Tokens: " + JSON.stringify(info.tokens);
    }
    
    return JSON.stringify(data).slice(0, 500);
  } catch (e: any) {
    return `Error: ${e.message ?? e}`;
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
