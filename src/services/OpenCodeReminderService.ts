/**
 * @layer integration
 * @integration OpenCode
 * @description 向 OpenCode AI 发送提醒消息，引导 AI 持续改进项目
 *
 * 架构说明：
 * - 这是集成层服务，不是核心功能
 * - 失败不影响 Nezha 核心功能
 * - 可以替换为其他 AI 集成（Trae、Cursor 等）
 * - 参考：docs/INTEGRATION_ARCHITECTURE.md
 */
import { DatabaseClient, logger, ReminderTemplateService, type SystemStatus } from 'nezha';
import { OPENCODE_API } from '../config/constants.js';

export interface OpenCodeReminderConfig {
  opencodeUrl: string;
  username?: string;
  password?: string;
  reminderIntervalMs?: number;
}

export class OpenCodeReminderService {
  private readonly db: DatabaseClient;
  private readonly config: Required<OpenCodeReminderConfig>;
  private readonly templateService: ReminderTemplateService;
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  constructor(db: DatabaseClient, config: OpenCodeReminderConfig) {
    this.db = db;
    const defaultUrl = `http://${OPENCODE_API.DEFAULT_HOST}:${OPENCODE_API.DEFAULT_PORT}`;
    this.config = {
      opencodeUrl: config.opencodeUrl || defaultUrl,
      username: config.username || process.env.OPENCODE_SERVER_USERNAME || 'opencode',
      password: config.password || process.env.OPENCODE_SERVER_PASSWORD || '',
      reminderIntervalMs: config.reminderIntervalMs || 2 * 60 * 1000,
    };
    this.templateService = new ReminderTemplateService(db);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[OpenCodeReminder] Service already running');
      return;
    }

    logger.info('[OpenCodeReminder] Starting service...');
    logger.info(`[OpenCodeReminder] OpenCode URL: ${this.config.opencodeUrl}`);
    logger.info(`[OpenCodeReminder] Reminder interval: ${this.config.reminderIntervalMs}ms`);

    try {
      await this.createSession();

      this.timer = setInterval(async () => {
        await this.sendReminder();
      }, this.config.reminderIntervalMs);

      this.isRunning = true;

      await this.sendReminder();

      logger.info('[OpenCodeReminder] Service started successfully');
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to start service:', error);
      throw error;
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('[OpenCodeReminder] Service stopped');
  }

  private async createSession(): Promise<void> {
    try {
      const response = await fetch(`${this.config.opencodeUrl}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ title: 'nezha-reminder-session' }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to create session: ${response.status} ${response.statusText} - ${text}`
        );
      }

      const data = (await response.json()) as { id: string };
      this.sessionId = data.id;
      logger.info(`[OpenCodeReminder] Created session: ${this.sessionId}`);
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to create session:', error);
      throw error;
    }
  }

  private async sendReminder(): Promise<void> {
    if (!this.sessionId || !(await this.isSessionAlive())) {
      if (this.sessionId) {
        logger.info('[OpenCodeReminder] Session dead, recreating...');
      }
      await this.createSession();
      if (!this.sessionId) return;
    }

    try {
      const status = await this.collectSystemStatus();

      if (this.shouldSkipReminder(status)) {
        logger.debug('[OpenCodeReminder] Skipping reminder - nothing actionable');
        return;
      }

      const message = await this.generateReminderMessage(status);

      await this.sendMessage(message);
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to send reminder:', error);

      if (error instanceof Error && error.message.includes('session')) {
        this.sessionId = null;
      }
    }
  }

  private shouldSkipReminder(_status: SystemStatus): boolean {
    return false;
  }

  private async collectSystemStatus(): Promise<SystemStatus> {
    const pendingTasks = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'PENDING'`
    );

    const failedTasks = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'FAILED' AND created_at > NOW() - INTERVAL '24 hours'`
    );

    const openIssues = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM issues WHERE status = 'open'`
    );

    const recentMemories = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM memory WHERE created_at > NOW() - INTERVAL '24 hours'`
    );

    const totalMemories = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM memory`
    );

    const criticalTasks = await this.db.query<{ title: string; priority: number }>(
      `SELECT title, priority FROM tasks WHERE status = 'PENDING' AND priority >= 8 ORDER BY priority DESC LIMIT 5`
    );

    const recentLearnings = await this.db.query<{ content: string; tags: string[] }>(
      `SELECT content, tags FROM memory WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY importance DESC LIMIT 5`
    );

    const openIssuesList = await this.db.query<{
      id: string;
      title: string;
      severity: string;
      issue_type: string;
      status: string;
    }>(
      `SELECT id, title, severity, issue_type, status FROM issues WHERE status = 'open' 
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, 
       created_at DESC LIMIT 10`
    );

    const pending = parseInt(pendingTasks.rows[0]?.count || '0', 10);
    const failed = parseInt(failedTasks.rows[0]?.count || '0', 10);
    const issues = parseInt(openIssues.rows[0]?.count || '0', 10);
    const memories = parseInt(recentMemories.rows[0]?.count || '0', 10);

    return {
      pendingTasks: pending,
      failedTasks: failed,
      openIssues: issues,
      recentMemories: memories,
      hasIssues: pending > 0 || failed > 0 || issues > 0,
      criticalTasks: criticalTasks.rows,
      recentLearnings: recentLearnings.rows.map(r => ({
        content: r.content,
        tags: r.tags || [],
      })),
      suggestions: [
        'Review recent code changes',
        'Optimize slow queries',
        'Update documentation',
        'Run comprehensive tests',
      ],
      totalMemories: parseInt(totalMemories.rows[0]?.count || '0', 10),
      openIssuesList: openIssuesList.rows.map(i => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        issueType: i.issue_type,
        status: i.status,
      })),
    };
  }

  private async generateReminderMessage(status: SystemStatus): Promise<string> {
    try {
      const template = await this.templateService.selectBestTemplate(status);
      const message = this.templateService.renderTemplate(template.template, status);
      logger.debug(`[OpenCodeReminder] Using template: ${template.name}`);
      return message;
    } catch (error) {
      logger.warn(
        '[OpenCodeReminder] Failed to load template from database, using fallback:',
        error
      );
      return this.generateFallbackMessage(status);
    }
  }

  private generateFallbackMessage(status: SystemStatus): string {
    const parts: string[] = [];

    parts.push('🤖 **Nezha 秘书提醒**\n');

    parts.push('📊 **系统状态**:');
    if (status.pendingTasks > 0) {
      parts.push(`- 📋 ${status.pendingTasks} 个待处理任务`);
    }
    if (status.failedTasks > 0) {
      parts.push(`- ❌ ${status.failedTasks} 个失败任务`);
    }
    if (status.openIssues > 0) {
      parts.push(`- 🐛 ${status.openIssues} 个开放问题`);
      if (status.openIssuesList && status.openIssuesList.length > 0) {
        parts.push('  具体问题:');
        status.openIssuesList.forEach((issue, idx) => {
          parts.push(`    ${idx + 1}. [${issue.severity}] ${issue.title} (${issue.id})`);
        });
      }
    }
    if (status.recentMemories > 0) {
      parts.push(`- 📚 ${status.recentMemories} 条新学习`);
    }

    parts.push('\n🎯 **建议下一步行动**:');
    if (status.pendingTasks > 0) {
      parts.push('1. 处理待办任务 (使用 `nezha tasks` 查看)');
    }
    if (status.failedTasks > 0) {
      parts.push('2. 分析失败任务 (使用 `nezha failed` 查看)');
    }
    if (status.openIssues > 0) {
      parts.push('3. 解决开放问题 (使用 `nezha issues` 查看)');
    }
    if (status.pendingTasks === 0 && status.failedTasks === 0 && status.openIssues === 0) {
      parts.push('✨ 系统状态良好！可以考虑：');
      parts.push('- 代码审查');
      parts.push('- 学习新技术');
      parts.push('- 优化现有代码');
    }

    parts.push('\n🔄 **NEVER DECLARE DONE** - 总有更多可以改进的地方');
    parts.push('\n💡 **提示**: 自主决策，不要等待人类指示');

    return parts.join('\n');
  }

  private async sendMessage(message: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error('No active session');
    }

    try {
      const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({
          parts: [{ type: 'text', text: message }],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to send message: ${response.status} ${response.statusText} - ${text}`
        );
      }

      logger.info('[OpenCodeReminder] Reminder sent successfully');
    } catch (error) {
      logger.error('[OpenCodeReminder] Failed to send message:', error);
      throw error;
    }
  }

  private getAuthHeader(): Record<string, string> {
    if (this.config.username && this.config.password) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
        'base64'
      );
      return { Authorization: `Basic ${credentials}` };
    }
    return {};
  }

  private async isSessionAlive(): Promise<boolean> {
    if (!this.sessionId) return false;

    try {
      const response = await fetch(`${this.config.opencodeUrl}/session/${this.sessionId}`, {
        headers: this.getAuthHeader(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
