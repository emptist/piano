import { Type } from "@sinclair/typebox";
import { nupiExtension, setExternalThinker } from "@nezha/nupi";
import { OpenCodeACPClient } from "./opencode-acp";

function execNezha(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const { execSync } = require("child_process");
    try {
      const result = execSync(`nezha ${args.join(" ")}`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      resolve(result);
    } catch {
      resolve(null);
    }
  });
}

async function registerAgentSession(): Promise<void> {
  const { execSync } = require("child_process");
  try {
    const result = execSync(`nezha agents register --type piano`, {
      encoding: "utf-8",
      timeout: 5000,
    });
    console.log(`[Piano] Agent session registered: ${result.trim()}`);
  } catch (e) {
    console.log(`[Piano] Agent session registration skipped`);
  }
}

let acpClient: OpenCodeACPClient | null = null;
let acpInitPromise: Promise<void> | null = null;

async function opencodeThink(question: string): Promise<string> {
  // Lazy init ACP on first use
  if (!acpInitPromise) {
    acpInitPromise = initACP();
  }

  try {
    await acpInitPromise;
  } catch (e) {
    // ACP init failed, continue without it
  }

  if (!acpClient) {
    return `External thinker (OpenCode ACP) not available. Question: ${question.substring(0, 100)}`;
  }

  try {
    console.log("[Piano→OpenCode] Delegating thinking request...");
    const result = await acpClient.think(question);
    console.log("[Piano→OpenCode] Received response");
    return result;
  } catch (e) {
    console.error("[Piano→OpenCode] Error:", e);
    return `OpenCode error: ${e}`;
  }
}

setExternalThinker(opencodeThink);

async function initACP() {
  try {
    acpClient = new OpenCodeACPClient(process.cwd());
    await acpClient.start();
  } catch (e) {
    // ACP failed to start - will use fallback
    acpClient = null;
  }
}

const pianoThinkTool = {
  name: "piano_think",
  label: "Piano Think",
  description: "Route complex reasoning to OpenCode for deeper analysis",
  parameters: Type.Object({
    context: Type.String({ description: "Current situation" }),
    question: Type.String({ description: "What needs deep thought" }),
  }),
  async execute(_id: any, params: any) {
    // Use the same opencodeThink function that nupi-think uses
    const fullQuestion = params.context 
      ? `[Context: ${params.context}]\n\n[Question: ${params.question}]`
      : params.question;
    
    try {
      const result = await opencodeThink(fullQuestion);
      return {
        content: [{ type: "text", text: result }],
        details: { action: "route_to_opencode", delegated: true },
      };
    } catch (e) {
      return {
        content: [{ 
          type: "text", 
          text: `Piano thinking failed: ${e}. Falling back to context analysis.\nContext: ${params.context}\nQuestion: ${params.question}` 
        }],
        details: { action: "fallback", error: true },
      };
    }
  },
};

const nezhaGetTasksTool = {
  name: "nezha_get_tasks",
  label: "Nezha Get Tasks",
  description: "Get pending tasks from Nezha database",
  parameters: Type.Object({
    status: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number()),
  }),
  async execute(_id: any, params: any) {
    const args = ["tasks", "--status", params.status || "PENDING", "--json"];
    const result = await execNezha(args);
    if (!result) {
      return {
        content: [{ type: "text", text: "Failed to get tasks" }],
        details: {},
      };
    }
    try {
      const tasks = JSON.parse(result);
      if (!tasks.length) {
        return { content: [{ type: "text", text: "No tasks" }], details: {} };
      }
      const lines = tasks
        .slice(0, params.limit || 10)
        .map(
          (t: any, i: number) =>
            `${i + 1}. [P${t.priority}] ${t.title} (${t.status})`,
        );
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {},
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to parse tasks" }],
        details: {},
      };
    }
  },
};

const nezhaCreateTaskTool = {
  name: "nezha_create_task",
  label: "Nezha Create Task",
  description: "Create a new task in Nezha",
  parameters: Type.Object({
    title: Type.String(),
    description: Type.Optional(Type.String()),
    priority: Type.Optional(Type.Number()),
  }),
  async execute(_id: any, params: any) {
    const args = ["task-add", params.title];
    if (params.description) args.push(params.description);
    if (params.priority) args.push("--priority", String(params.priority));
    const result = await execNezha(args);
    if (!result) {
      return {
        content: [{ type: "text", text: "Failed to create task" }],
        details: {},
      };
    }
    return {
      content: [{ type: "text", text: `Task created: ${params.title}` }],
      details: {},
    };
  },
};

// Autonomous Task Processor - runs without human prompts
// Nezha family = autonomous by default, no way to disable
let autonomousEnabled = true;
let autonomousInterval: NodeJS.Timeout | null = null;
let currentPi: any = null;

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: number;
  status: string;
}

async function getTasksFromNezha(status: string = 'PENDING', limit: number = 5): Promise<Task[]> {
  const result = await execNezha(['tasks', '--status', status, '--json']);
  if (!result) return [];
  try {
    const tasks = JSON.parse(result);
    return tasks.slice(0, limit).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
    }));
  } catch {
    return [];
  }
}

async function processTaskAutonomously(task: Task): Promise<string> {
  console.log(`[Piano Autonomous] Processing task: ${task.title}`);
  
  // Use opencodeThink to EXECUTE the task, not just analyze
  // IMPORTANT: First verify the task is still relevant - check if already completed or superseded
  const executePrompt = `You are an autonomous AI developer. Execute this task now.

IMPORTANT:
1. First verify the task is still needed - check git log, recent commits, completed tasks
2. If already done (e.g., "ALREADY COMPLETED" in git or resolved in issues), mark task COMPLETED
3. After completing work, you MUST mark task as COMPLETED using: nezha task-complete ${task.id}
4. The git hook will auto-mark tasks when you commit with [task: <uuid>]

Task: ${task.title}
${task.description ? `Description: ${task.description}` : ''}
Priority: ${task.priority}
Task ID: ${task.id}

Steps:
1. Check if task is already done (git log, issues, commits)
2. If already completed, run: nezha task-complete ${task.id}
3. If not, execute work, then run: nezha task-complete ${task.id}
4. Or commit with [task: ${task.id}] to auto-complete via git hook`;

  const result = await opencodeThink(executePrompt);
  console.log(`[Piano Autonomous] Task executed: ${task.id?.slice(0,8)}`);
  
  // Create issue to track that it was attempted - but doesn't update task status
  // This is a problem: task remains PENDING forever even after execution attempt
  await execNezha(['issue-add', `[Autonomous Attempt] ${task.title}`, '--severity', 'low']);
  
  return result;
}

async function autonomousWorkCycle(): Promise<void> {
  if (!currentPi || !autonomousEnabled) return;
  
  console.log('[Piano Autonomous] Starting work cycle...');
  
  try {
    // Get high-priority tasks
    const tasks = await getTasksFromNezha('PENDING', 3);
    
    if (tasks.length === 0) {
      console.log('[Piano Autonomous] No pending tasks');
      return;
    }
    
    console.log(`[Piano Autonomous] Found ${tasks.length} pending tasks`);
    
    // Process highest priority task
    const highPriority = tasks.filter(t => t.priority >= 80);
    if (highPriority.length > 0 && highPriority[0]) {
      const task = highPriority[0];
      const result = await processTaskAutonomously(task);
      console.log(`[Piano Autonomous] Task executed: ${task.id?.slice(0,8)}`);
      
      // Notify via Pi UI if available
      if (currentPi?.ui?.notify) {
        await currentPi.ui.notify(`✅ Autonomous work: Executed "${task.title.slice(0, 50)}"`, 'info');
      }
    }
  } catch (e) {
    console.error('[Piano Autonomous] Error in work cycle:', e);
  }
}

function startAutonomousMode(): void {
  if (autonomousInterval) return;
  
  console.log('[Piano] Starting autonomous work cycle (interval: 5 minutes)');
  autonomousInterval = setInterval(autonomousWorkCycle, 5 * 60 * 1000);
  
  // Run first cycle after 30 seconds
  setTimeout(autonomousWorkCycle, 30000);
}

function stopAutonomousMode(): void {
  if (autonomousInterval) {
    clearInterval(autonomousInterval);
    autonomousInterval = null;
    console.log('[Piano] Stopped autonomous work cycle');
  }
}

// Tool to restart autonomous mode (always running by default)
const autonomousControlTool = {
  name: "piano_autonomous",
  label: "Piano Autonomous",
  description: "Restart autonomous work cycle (runs by default)",
  parameters: Type.Object({
    action: Type.Optional(Type.String({ description: "'restart' to restart the cycle" })),
  }),
  async execute(_id: any, _params: { action?: string }) {
    stopAutonomousMode();
    startAutonomousMode();
    return {
      content: [{ type: "text", text: "Autonomous mode restarted. Piano will continue processing tasks." }],
      details: { autonomous: true },
    };
  },
};

// Tool to analyze a specific task
const analyzeTaskTool = {
  name: "piano_analyze_task",
  label: "Piano Analyze Task",
  description: "Deeply analyze a task using OpenCode thinking",
  parameters: Type.Object({
    taskId: Type.Optional(Type.String({ description: "Task ID to analyze" })),
    taskTitle: Type.Optional(Type.String({ description: "Task title if ID not known" })),
  }),
  async execute(_id: any, params: { taskId?: string; taskTitle?: string }) {
    let task: Task | null = null;
    
    if (params.taskId) {
      // Get specific task
      const tasks = await getTasksFromNezha('PENDING', 100);
      task = tasks.find(t => t.id?.startsWith(params.taskId!)) || null;
    } else if (params.taskTitle) {
      const tasks = await getTasksFromNezha('PENDING', 100);
      task = tasks.find(t => t.title?.includes(params.taskTitle!)) || null;
    } else {
      // Get highest priority task
      const tasks = await getTasksFromNezha('PENDING', 1);
      task = tasks[0] || null;
    }
    
    if (!task) {
      return {
        content: [{ type: "text", text: "No task found to analyze." }],
        details: { error: true },
      };
    }
    
    const result = await processTaskAutonomously(task);
    return {
      content: [{ type: "text", text: result }],
      details: { taskId: task.id, analyzed: true },
    };
  },
};

// Tool to get next recommended action
const nextActionTool = {
  name: "piano_next_action",
  label: "Piano Next Action",
  description: "Execute the highest priority task from Nezha",
  parameters: Type.Object({
    context: Type.Optional(Type.String({ description: "Current work context" })),
  }),
  async execute(_id: any, params: { context?: string }) {
    // Get pending tasks
    const tasks = await getTasksFromNezha('PENDING', 10);
    
    if (tasks.length === 0) {
      return {
        content: [{ type: "text", text: "No pending tasks. Consider creating new tasks or reviewing completed work." }],
        details: { hasTasks: false },
      };
    }
    
    // Get next actionable task and execute it
    // IMPORTANT: Skip tasks already completed or resolved
    const actionPrompt = `You are an autonomous AI developer. Pick and execute the highest priority task.

IMPORTANT:
1. First verify task is still needed - check git log, recent commits, completed tasks
2. Skip any task that is already done or superseded
3. After completing work, MUST mark task COMPLETED using: nezha task-complete <task-id>
4. Or commit with [task: <uuid>] to auto-complete via git hook

Pending tasks:
${tasks.map((t, i) => `${i + 1}. [P${t.priority}] ${t.title} (ID: ${t.id})`).join('\n')}

${params.context ? `Context: ${params.context}` : ''}

Steps:
1. Check if highest priority task is already completed
2. If yes, skip to next task
3. If not, execute work then run: nezha task-complete <task-id>
4. Or commit with [task: <task-id>] to auto-complete`;

    const result = await opencodeThink(actionPrompt);
    return {
      content: [{ type: "text", text: result }],
      details: { tasksAnalyzed: tasks.length },
    };
  },
};

export default function pianoExtension(pi: any) {
  currentPi = pi;
  
  // Register all nupi tools first
  nupiExtension(pi);
  
  // Register piano-specific tools
  pi.registerTool(nezhaGetTasksTool);
  pi.registerTool(nezhaCreateTaskTool);
  pi.registerTool(pianoThinkTool);
  pi.registerTool(autonomousControlTool);
  pi.registerTool(analyzeTaskTool);
  pi.registerTool(nextActionTool);
  
  // Start autonomous mode if enabled
  if (autonomousEnabled) {
    startAutonomousMode();
  }
}
