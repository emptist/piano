declare module '@nezha/nupi' {
  export interface PiTaskResult {
    success: boolean;
    result?: string;
    error?: string;
  }

  export interface PiConfig {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }

  export class PiExecutor {
    constructor(config?: PiConfig);
    execute(task: string): Promise<PiTaskResult>;
  }

  export class PiSDKExecutor {
    constructor(config?: PiConfig);
    execute(task: string): Promise<PiTaskResult>;
  }

  export interface TaskRow {
    id: string;
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    category?: string;
    result?: string;
    error?: string;
    created_at?: string;
    updated_at?: string;
  }

  export interface NuPIClient {
    health(): Promise<{ status: string }>;
    getTasks(status?: string, limit?: number): Promise<{ rows: TaskRow[] }>;
    getPendingTask(limit?: number): Promise<TaskRow | null>;
    createTask(task: { title: string; description: string; priority?: number; category?: string }): Promise<{ id: string }>;
    updateTask(id: string, data: any): Promise<any>;
    updateTaskStatus(id: string, status: string): Promise<any>;
    updateTaskResult(id: string, result: string): Promise<any>;
    updateTaskError(id: string, error: string): Promise<any>;
    searchTasks(query: string, limit?: number): Promise<{ rows: TaskRow[] }>;
    createIssue(issue: { title: string; description: string; severity?: string }): Promise<{ id: string }>;
    getIssues(limit?: number): Promise<{ rows: any[] }>;
    learn(insight: string, context?: string): Promise<{ id: string }>;
    memorySearch(query: string, limit?: number): Promise<{ rows: any[] }>;
    saveMemory(content: string, tags?: string[]): Promise<unknown>;
    getSkills(): Promise<{ skills: any[] }>;
    getSkill(name: string): Promise<any>;
  }

  export function getNuPIClient(baseUrl?: string): NuPIClient;
}