import { spawn } from 'child_process';
import { ConversationLogger } from './ConversationLogger.js';

export interface OpenCodeConfig {
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  providerId: string;
  serverUrl?: string;
}

export interface OpenCodeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenCodeResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

export class OpenCodeClient {
  private config: OpenCodeConfig;
  private conversationLogger: ConversationLogger;
  private serverUrl: string;

  constructor(config: OpenCodeConfig, conversationLogger: ConversationLogger) {
    this.config = config;
    this.conversationLogger = conversationLogger;
    this.serverUrl = config.serverUrl || 'http://localhost:4096';
  }

  async sendMessage(
    messages: OpenCodeMessage[],
    _options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsg = messages.find(m => m.role === 'user')?.content || '';

    const fullPrompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg;

    return this.runOpenCode(fullPrompt);
  }

  private runOpenCode(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['run', '--attach', this.serverUrl, '--format', 'json', prompt];

      const proc = spawn('opencode', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', data => {
        output += data.toString();
      });

      proc.stderr.on('data', data => {
        errorOutput += data.toString();
      });

      proc.on('close', code => {
        if (code === 0) {
          try {
            const response = this.parseJsonOutput(output);
            resolve(response);
          } catch {
            resolve(output);
          }
        } else {
          reject(new Error(`opencode exited with code ${code}: ${errorOutput}`));
        }
      });

      proc.on('error', err => {
        reject(new Error(`Failed to spawn opencode: ${err.message}`));
      });
    });
  }

  private parseJsonOutput(output: string): string {
    const lines = output.trim().split('\n');
    const textParts: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'text' && event.part?.text) {
          textParts.push(event.part.text);
        }
      } catch {
        continue;
      }
    }

    return textParts.join('');
  }

  async executeTask(
    task: {
      id: string;
      title: string;
      description: string;
    },
    context?: string
  ): Promise<{
    success: boolean;
    output: string;
    artifacts: string[];
  }> {
    this.conversationLogger.startConversation(task, 'task_execution');

    try {
      const systemPrompt = `You are an AI assistant helping with software development tasks.
You have access to the Nezha system which provides:
- Memory system for storing and retrieving knowledge
- Semantic search for finding relevant past experiences (use semantic_search function when you need to recall similar tasks or solutions)
- Task scheduling and execution
- Conversation logging for learning

When you need to find relevant past experiences or similar solutions, use the semantic_search function to search through your memory.

## Git Commit Guidelines

After completing your work, commit your changes with a meaningful message:
- Use conventional commit format: \`feat:\`, \`fix:\`, \`docs:\`, \`refactor:\`, \`test:\`, \`chore:\`
- Describe WHAT you changed and WHY
- Example: \`feat: Add user authentication endpoint\`

## ⚠️ CRITICAL SAFETY RULES - GIT OPERATIONS

**NEVER run these dangerous git commands:**
- \`git filter-branch\` - Will corrupt history
- \`git rebase\` - Can cause merge conflicts and data loss
- \`git push --force\` or \`git push -f\` - Will overwrite remote history
- \`git reset --hard\` - Will lose uncommitted work
- \`git clean -fd\` - Will delete untracked files

**If you need to fix commit messages:**
1. Fix the underlying bug in the code
2. Make a new commit with a proper message
3. DO NOT try to rewrite history

Current task: ${task.title}
Description: ${task.description}

${context ? `Context: ${context}` : ''}

Please analyze the task and provide a detailed solution.`;

      this.conversationLogger.addMessage('user', `Task: ${task.title}`);

      const response = await this.sendMessage([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please help me with this task: ${task.description}` },
      ]);

      this.conversationLogger.addMessage('assistant', response);

      const result = {
        success: true,
        output: response,
        artifacts: this.extractArtifacts(response),
      };

      await this.conversationLogger.endConversation(result);

      return result;
    } catch (error) {
      const result = {
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
        artifacts: [],
      };

      await this.conversationLogger.endConversation(result);

      throw error;
    }
  }

  async streamResponse(
    messages: OpenCodeMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
    onChunk?: (text: string) => void
  ): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsg = messages.find(m => m.role === 'user')?.content || '';

    const fullPrompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg;

    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--attach',
        this.serverUrl,
        '--format',
        'json',
        '--thinking',
        fullPrompt,
      ];

      const proc = spawn('opencode', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let output = '';
      let buffer = '';

      proc.stdout.on('data', data => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'text' && event.part?.text) {
              output += event.part.text;
              onChunk?.(event.part.text);
            }
          } catch {
            continue;
          }
        }
      });

      proc.on('close', (_code: number | null) => {
        resolve(output);
      });

      proc.on('error', err => {
        reject(new Error(`Failed to spawn opencode: ${err.message}`));
      });
    });
  }

  private extractArtifacts(content: string): string[] {
    const artifacts: string[] = [];

    const filePattern = /(?:file|created|modified|updated):\s*([^\s]+\.(ts|js|json|md|txt))/gi;
    let match;

    while ((match = filePattern.exec(content)) !== null) {
      const filename = match[1];
      if (filename) {
        artifacts.push(filename);
      }
    }

    return artifacts;
  }
}
