export interface PianoMcpConfig {
  openCodeUrl: string;
  auth?: {
    username: string;
    password: string;
  };
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: string[];
  resources?: string[];
  error?: string;
}

interface McpConfig {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: string[];
  resources?: string[];
  error?: string;
}

export class PianoMcpService {
  private config: PianoMcpConfig;
  private authHeader: Record<string, string> = {};

  constructor(config: PianoMcpConfig) {
    this.config = config;
    if (config.auth?.username && config.auth?.password) {
      const credentials = Buffer.from(
        `${config.auth.username}:${config.auth.password}`
      ).toString('base64');
      this.authHeader = { 'Authorization': `Basic ${credentials}` };
    }
  }

  async getStatus(): Promise<Record<string, McpServerStatus>> {
    try {
      const response = await fetch(`${this.config.openCodeUrl}/mcp`, {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get MCP status: ${response.status}`);
      }

      const data = await response.json() as Record<string, { status: string }>;
      const result: Record<string, McpServerStatus> = {};
      
      for (const [name, info] of Object.entries(data)) {
        result[name] = {
          name,
          status: info.status as 'connected' | 'disconnected' | 'error',
        };
      }
      
      return result;
    } catch (error) {
      console.error('[PianoMcp] Failed to get status:', error);
      return {};
    }
  }

  async addServer(name: string, config: McpServerConfig): Promise<McpServerStatus> {
    try {
      const mcpConfig: McpConfig = {
        type: 'stdio',
        command: config.command,
        args: config.args || [],
        env: config.env || {},
      };

      const response = await fetch(`${this.config.openCodeUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader,
        },
        body: JSON.stringify({ name, config: mcpConfig }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to add MCP server: ${response.status} - ${error}`);
      }

      const result = await response.json() as { status: string };
      return {
        name,
        status: result.status as 'connected' | 'disconnected' | 'error',
      };
    } catch (error) {
      return {
        name,
        status: 'error',
        error: String(error),
      };
    }
  }

  async removeServer(name: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.openCodeUrl}/mcp/${name}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('[PianoMcp] Failed to remove server:', error);
      return false;
    }
  }

  async startOAuth(name: string): Promise<{ authorizationUrl: string }> {
    const response = await fetch(`${this.config.openCodeUrl}/mcp/${name}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start OAuth: ${response.status}`);
    }

    return response.json() as Promise<{ authorizationUrl: string }>;
  }

  async completeOAuth(name: string, code: string): Promise<McpServerStatus> {
    const response = await fetch(`${this.config.openCodeUrl}/mcp/${name}/auth/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeader,
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      throw new Error(`Failed to complete OAuth: ${response.status}`);
    }

    const result = await response.json() as { status: string };
    return {
      name,
      status: result.status as 'connected' | 'disconnected' | 'error',
    };
  }
}

export function createPianoMcpService(config: PianoMcpConfig): PianoMcpService {
  return new PianoMcpService(config);
}