import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';

export interface ExternalAgentConfig {
  name: string;
  description?: string;
}

export interface ExternalAgentRequest {
  task: string;
  tools?: string[];
  model?: string;
  cwd?: string;
}

export interface ExternalAgentResponse {
  agent: string;
  agentSource: 'external';
  task: string;
  exitCode: number;
  messages: unknown[];
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    contextTokens: number;
    turns: number;
  };
  model?: string;
}

export interface ExternalAgentServerConfig {
  port: number;
  openCodeUrl: string;
  openCodeAuth?: {
    username: string;
    password: string;
  };
}

export class ExternalAgentServer {
  private server: http.Server | null = null;
  private config: ExternalAgentServerConfig;
  private agents: Map<string, ExternalAgentConfig> = new Map();
  private sessionId: string | null = null;

  constructor(config: ExternalAgentServerConfig) {
    this.config = config;
  }

  registerAgent(name: string, config: ExternalAgentConfig): void {
    this.agents.set(name, config);
    console.log(`[ExternalAgentServer] Registered agent: ${name}`);
  }

  async start(): Promise<void> {
    await this.createSession();

    this.server = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        console.log(`[ExternalAgentServer] Running on port ${this.config.port}`);
        console.log(`[ExternalAgentServer] Available agents: ${Array.from(this.agents.keys()).join(', ')}`);
        console.log(`[ExternalAgentServer] Session: ${this.sessionId}`);
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  private getAuthHeader(): Record<string, string> {
    if (this.config.openCodeAuth?.username && this.config.openCodeAuth?.password) {
      const credentials = Buffer.from(
        `${this.config.openCodeAuth.username}:${this.config.openCodeAuth.password}`
      ).toString('base64');
      return { 'Authorization': `Basic ${credentials}` };
    }
    return {};
  }

  private async createSession(): Promise<void> {
    const response = await fetch(`${this.config.openCodeUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader(),
      },
      body: JSON.stringify({ title: 'piano-external-agent' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    const data = await response.json() as { id: string };
    this.sessionId = data.id;
    console.log(`[ExternalAgentServer] Created session: ${this.sessionId}`);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url?.split('?')[0] || '';
    const method = req.method;

    res.setHeader('Content-Type', 'application/json');

    try {
      const body = await this.parseBody(req);
      
      if (method === 'POST' && this.agents.has(url.slice(1))) {
        const agentName = url.slice(1);
        await this.handleAgentRequest(agentName, body, res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  private async parseBody(req: IncomingMessage): Promise<ExternalAgentRequest> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  private async handleAgentRequest(
    agentName: string,
    request: ExternalAgentRequest,
    res: ServerResponse
  ): Promise<void> {
    console.log(`[ExternalAgentServer] ${agentName} received task: ${request.task.substring(0, 50)}...`);

    if (!this.sessionId) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Session not initialized' }));
      return;
    }

    try {
      const agentConfig = this.agents.get(agentName);
      const systemPrompt = this.getSystemPrompt(agentName, agentConfig);
      
      const message = `${systemPrompt}\n\n## Task\n${request.task}`;
      
      const response = await fetch(
        `${this.config.openCodeUrl}/session/${this.sessionId}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeader(),
          },
          body: JSON.stringify({
            parts: [{ type: 'text', text: message }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenCode request failed: ${response.status}`);
      }

      const result: ExternalAgentResponse = {
        agent: agentName,
        agentSource: 'external',
        task: request.task,
        exitCode: 0,
        messages: [{ role: 'user', content: message }],
        stderr: '',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          contextTokens: 0,
          turns: 1,
        },
        model: request.model || 'opencode-default',
      };

      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (error) {
      const errorResponse: ExternalAgentResponse = {
        agent: agentName,
        agentSource: 'external',
        task: request.task,
        exitCode: 1,
        messages: [],
        stderr: String(error),
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          contextTokens: 0,
          turns: 0,
        },
      };
      res.writeHead(500);
      res.end(JSON.stringify(errorResponse));
    }
  }

  private getSystemPrompt(agentName: string, config?: ExternalAgentConfig): string {
    const prompts: Record<string, string> = {
      scout: `You are a scout. Quickly investigate a codebase and return structured findings that another agent can use without re-reading everything.

Output format:
## Files Retrieved
List with exact line ranges

## Key Code
Critical types, interfaces, or functions

## Architecture
Brief explanation of how the pieces connect

## Start Here
Which file to look at first and why`,

      planner: `You are a planning specialist. You receive context and requirements, then produce a clear implementation plan.

You must NOT make any changes. Only read, analyze, and plan.

Output format:
## Goal
One sentence summary

## Plan
Numbered steps, each small and actionable

## Files to Modify
What changes

## Risks
Anything to watch out for`,

      worker: `You are a worker agent with full capabilities. Work autonomously to complete the assigned task.

Output format:
## Completed
What was done

## Files Changed
What changed

## Notes
Anything the main agent should know`,
    };

    return prompts[agentName] || config?.description || `You are a ${agentName} agent. Complete the task.`;
  }

  stop(): void {
    this.server?.close();
    console.log('[ExternalAgentServer] Stopped');
  }
}

export function createExternalAgentServer(config: ExternalAgentServerConfig): ExternalAgentServer {
  return new ExternalAgentServer(config);
}