/**
 * @layer integration
 * @integration OpenCode
 * @description Send reminder messages to OpenCode AI to guide continuous improvement
 *
 * Architecture:
 * - Integration layer service, not core functionality
 * - Failure does not affect Nezha core
 * - Can be replaced with other AI integrations (Trae, Cursor, etc.)
 * - Uses HTTP API (/status/full) instead of direct DB access
 */
import { ReminderTemplateService, SystemStatus } from "nezha";
import { logger } from "nezha";
import { OPENCODE_API } from "nezha";

const DEFAULT_API_URL = 'http://127.0.0.1:4099';
const STATUS_FETCH_TIMEOUT_MS = 10000;

export interface OpenCodeReminderConfig {
  opencodeUrl: string;
  apiUrl?: string;
  username?: string;
  password?: string;
  reminderIntervalMs?: number;
}

interface FullSystemStatus extends SystemStatus {
  pendingTasks: number;
  failedTasks: number;
  openIssues: number;
  recentMemories: number;
  memoryCount: number;
}

export class OpenCodeReminderService {
  private readonly config: Required<OpenCodeReminderConfig>;
  private readonly templateService: ReminderTemplateService;
  private readonly apiBaseUrl: string;
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(dbOrConfig: any, config?: OpenCodeReminderConfig) {
    const cfg = config || (dbOrConfig as OpenCodeReminderConfig);
    const defaultUrl = `http://${OPENCODE_API.DEFAULT_HOST}:${OPENCODE_API.DEFAULT_PORT}`;
    this.config = {
      opencodeUrl: cfg.opencodeUrl || defaultUrl,
      apiUrl: cfg.apiUrl || process.env.NEZHA_API_URL || DEFAULT_API_URL,
      username:
        cfg.username || process.env.OPENCODE_SERVER_USERNAME || "opencode",
      password:
        cfg.password || process.env.OPENCODE_SERVER_PASSWORD || "",
      reminderIntervalMs: cfg.reminderIntervalMs || 2 * 60 * 1000,
    };
    this.apiBaseUrl = this.config.apiUrl;

    if (dbOrConfig && typeof dbOrConfig === 'object' && 'query' in dbOrConfig) {
      this.templateService = new ReminderTemplateService(dbOrConfig);
    } else {
      this.templateService = new ReminderTemplateService({ query: async () => ({ rows: [] }) } as any);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("[OpenCodeReminder] Service already running");
      return;
    }

    logger.info("[OpenCodeReminder] Starting service...");
    logger.info(`[OpenCodeReminder] OpenCode URL: ${this.config.opencodeUrl}`);
    logger.info(
      `[OpenCodeReminder] Reminder interval: ${this.config.reminderIntervalMs}ms`,
    );

    try {
      await this.createSession();

      this.timer = setInterval(async () => {
        await this.sendReminder();
      }, this.config.reminderIntervalMs);

      this.isRunning = true;

      await this.sendReminder();

      logger.info("[OpenCodeReminder] Service started successfully");
    } catch (error) {
      logger.error("[OpenCodeReminder] Failed to start service:", error);
      throw error;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info("[OpenCodeReminder] Service stopped");
  }

  private async createSession(): Promise<void> {
    try {
      const response = await fetch(`${this.config.opencodeUrl}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ title: "nezha-reminder-session" }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to create session: ${response.status} ${response.statusText} - ${text}`,
        );
      }

      const data = (await response.json()) as { id: string };
      this.sessionId = data.id;
      logger.info(`[OpenCodeReminder] Created session: ${this.sessionId}`);
    } catch (error) {
      logger.error("[OpenCodeReminder] Failed to create session:", error);
      throw error;
    }
  }

  private async sendReminder(): Promise<void> {
    if (!this.sessionId || !(await this.isSessionAlive())) {
      if (this.sessionId) {
        logger.info("[OpenCodeReminder] Session dead, recreating...");
      }
      await this.createSession();
      if (!this.sessionId) return;
    }

    try {
      const status = await this.collectSystemStatus();

      if (this.shouldSkipReminder(status)) {
        logger.debug(
          "[OpenCodeReminder] Skipping reminder - nothing actionable",
        );
        return;
      }

      const message = await this.generateReminderMessage(status);

      await this.sendMessage(message);
    } catch (error) {
      logger.error("[OpenCodeReminder] Failed to send reminder:", error);

      if (error instanceof Error && error.message.includes("session")) {
        this.sessionId = null;
      }
    }
  }

  private shouldSkipReminder(_status: SystemStatus): boolean {
    return false;
  }

  private async collectSystemStatus(): Promise<SystemStatus> {
    try {
      const url = `${this.apiBaseUrl}/status/full`;
      const apiKey = process.env.NEZHA_API_KEY;
      const fetchUrl = apiKey ? `${url}?api_key=${apiKey}` : url;

      const response = await fetch(fetchUrl, {
        signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        logger.warn(
          `[OpenCodeReminder] API status request failed: ${response.status}, falling back to empty status`
        );
        return this.getEmptyStatus();
      }

      const data = (await response.json()) as FullSystemStatus;
      logger.debug(`[OpenCodeReminder] Fetched system status via API`);
      return data;
    } catch (error) {
      logger.warn(`[OpenCodeReminder] Failed to fetch status via API:`, error);
      return this.getEmptyStatus();
    }
  }

  private getEmptyStatus(): SystemStatus {
    return {
      pendingTasks: 0,
      failedTasks: 0,
      openIssues: 0,
      recentMemories: 0,
      hasIssues: false,
      criticalTasks: [],
      recentLearnings: [],
      suggestions: [],
      totalMemories: 0,
      openIssuesList: [],
    };
  }

  private async generateReminderMessage(status: SystemStatus): Promise<string> {
    try {
      const template = await this.templateService.selectBestTemplate(status);
      const message = this.templateService.renderTemplate(
        template.template,
        status,
      );
      logger.debug(`[OpenCodeReminder] Using template: ${template.name}`);
      return message;
    } catch (error) {
      logger.warn(
        "[OpenCodeReminder] Failed to load template from database, using fallback:",
        error,
      );
      return this.generateFallbackMessage(status);
    }
  }

  private generateFallbackMessage(status: SystemStatus): string {
    const parts: string[] = [];

    parts.push("🤖 **Nezha 秘书提醒**\n");

    parts.push("📊 **系统状态**:");
    if (status.pendingTasks > 0) {
      parts.push(`- 📋 ${status.pendingTasks} 个待处理任务`);
    }
    if (status.failedTasks > 0) {
      parts.push(`- ❌ ${status.failedTasks} 个失败任务`);
    }
    if (status.openIssues > 0) {
      parts.push(`- 🐛 ${status.openIssues} 个开放问题`);
      if (status.openIssuesList && status.openIssuesList.length > 0) {
        parts.push("  具体问题:");
        status.openIssuesList.forEach((issue, idx) => {
          parts.push(
            `    ${idx + 1}. [${issue.severity}] ${issue.title} (${issue.id})`,
          );
        });
      }
    }
    if (status.recentMemories > 0) {
      parts.push(`- 📚 ${status.recentMemories} 条新学习`);
    }

    parts.push("\n🎯 **建议下一步行动**:");
    if (status.pendingTasks > 0) {
      parts.push("1. 处理待办任务 (使用 `nezha tasks` 查看)");
    }
    if (status.failedTasks > 0) {
      parts.push("2. 分析失败任务 (使用 `nezha failed` 查看)");
    }
    if (status.openIssues > 0) {
      parts.push("3. 解决开放问题 (使用 `nezha issues` 查看)");
    }
    if (
      status.pendingTasks === 0 &&
      status.failedTasks === 0 &&
      status.openIssues === 0
    ) {
      parts.push("✨ 系统状态良好！可以考虑：");
      parts.push("- 代码审查");
      parts.push("- 学习新技术");
      parts.push("- 优化现有代码");
    }

    parts.push("\n🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方");
    parts.push("\n💡 **提示**: 自主决策，不要等待人类指示");

    return parts.join("\n");
  }

  private async sendMessage(message: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session");
    }

    try {
      const response = await fetch(
        `${this.config.opencodeUrl}/session/${this.sessionId}/message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.getAuthHeader(),
          },
          body: JSON.stringify({
            parts: [{ type: "text", text: message }],
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to send message: ${response.status} ${response.statusText} - ${text}`,
        );
      }

      logger.info("[OpenCodeReminder] Reminder sent successfully");
    } catch (error) {
      logger.error("[OpenCodeReminder] Failed to send message:", error);
      throw error;
    }
  }

  private getAuthHeader(): Record<string, string> {
    if (this.config.username && this.config.password) {
      const credentials = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString("base64");
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }

  private async isSessionAlive(): Promise<boolean> {
    if (!this.sessionId) return false;

    try {
      const response = await fetch(
        `${this.config.opencodeUrl}/session/${this.sessionId}`,
        {
          headers: this.getAuthHeader(),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
