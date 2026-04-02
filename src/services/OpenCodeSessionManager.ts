import * as fs from "fs";
import * as path from "path";
import { logger } from "nezha";

export interface OpenCodeClientConfig {
  opencodeUrl: string;
  username?: string;
  password?: string;
  useAuth?: boolean;
}

export interface SessionMessage {
  parts: { type: "text"; text: string }[];
}

interface CachedSession {
  sessionId: string;
  createdAt: number;
  title: string;
}

export class OpenCodeSessionManager {
  private static instance: OpenCodeSessionManager | null = null;
  private sessionId: string | null = null;
  private config: Required<OpenCodeClientConfig>;
  private creatingSession: Promise<string> | null = null;
  private sessionCachePath: string;

  private constructor(config: OpenCodeClientConfig) {
    const defaultUrl = "http://localhost:11434";
    this.config = {
      opencodeUrl: config.opencodeUrl || defaultUrl,
      username:
        config.username || process.env.OPENCODE_SERVER_USERNAME || "opencode",
      password: config.password || process.env.OPENCODE_SERVER_PASSWORD || "",
      useAuth: config.useAuth ?? true,
    };

    const dataDir = path.join(process.cwd(), ".nezha");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.sessionCachePath = path.join(dataDir, "opencode-session.json");

    this.loadCachedSession();
  }

  private loadCachedSession(): void {
    try {
      if (fs.existsSync(this.sessionCachePath)) {
        const data = JSON.parse(
          fs.readFileSync(this.sessionCachePath, "utf-8"),
        ) as CachedSession;
        if (data.sessionId) {
          this.sessionId = data.sessionId;
          logger.info(
            `[OpenCodeSession] Loaded cached session: ${this.sessionId}`,
          );
        }
      }
    } catch (error) {
      logger.debug("[OpenCodeSession] Failed to load cached session:", error);
    }
  }

  private cacheSession(sessionId: string, title: string): void {
    try {
      const data: CachedSession = {
        sessionId,
        createdAt: Date.now(),
        title,
      };
      fs.writeFileSync(this.sessionCachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.warn("[OpenCodeSession] Failed to cache session:", error);
    }
  }

  clearCachedSession(): void {
    this.sessionId = null;
    try {
      if (fs.existsSync(this.sessionCachePath)) {
        fs.unlinkSync(this.sessionCachePath);
      }
    } catch (error) {
      logger.warn("[OpenCodeSession] Failed to clear cached session:", error);
    }
  }

  static getInstance(config?: OpenCodeClientConfig): OpenCodeSessionManager {
    if (!OpenCodeSessionManager.instance && config) {
      OpenCodeSessionManager.instance = new OpenCodeSessionManager(config);
    }
    if (!OpenCodeSessionManager.instance) {
      throw new Error(
        "OpenCodeSessionManager not initialized. Call getInstance with config first.",
      );
    }
    return OpenCodeSessionManager.instance;
  }

  static resetInstance(): void {
    OpenCodeSessionManager.instance = null;
  }

  static create(config: OpenCodeClientConfig): OpenCodeSessionManager {
    return new OpenCodeSessionManager(config);
  }

  async getSessionId(forceRecreate: boolean = false): Promise<string> {
    if (this.sessionId && !forceRecreate) {
      const isValid = await this.validateSession(this.sessionId);
      if (isValid) {
        return this.sessionId;
      }
      logger.info("[OpenCodeSession] Cached session invalid, creating new one");
      this.sessionId = null;
    }

    if (this.creatingSession) {
      return this.creatingSession;
    }

    this.creatingSession = this.doCreateSession();
    try {
      const sessionId = await this.creatingSession;
      this.sessionId = sessionId;
      this.cacheSession(sessionId, "nezha-shared-session");
      return sessionId;
    } finally {
      this.creatingSession = null;
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.opencodeUrl}/session/${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...this.getAuthHeader(),
          },
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async doCreateSession(): Promise<string> {
    try {
      const response = await fetch(`${this.config.opencodeUrl}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeader(),
        },
        body: JSON.stringify({ title: "nezha-shared-session" }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Failed to create session: ${response.status} ${response.statusText} - ${text}`,
        );
      }

      const data = (await response.json()) as { id: string };
      const sessionId = data.id.startsWith("ses_") ? data.id : `ses_${data.id}`;
      logger.info(`[OpenCodeSession] Created shared session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error("[OpenCodeSession] Failed to create session:", error);
      throw error;
    }
  }

  async sendMessage(message: SessionMessage): Promise<void> {
    const sessionId = await this.getSessionId();

    const response = await fetch(
      `${this.config.opencodeUrl}/session/${sessionId}/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeader(),
        },
        body: JSON.stringify(message),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      if (text.includes("session") || response.status === 404) {
        this.sessionId = null;
        logger.warn(
          "[OpenCodeSession] Session expired, will recreate on next use",
        );
      }
      throw new Error(
        `Message failed: ${response.status} ${response.statusText} - ${text}`,
      );
    }
  }

  async sendTextMessage(text: string): Promise<void> {
    await this.sendMessage({ parts: [{ type: "text", text }] });
  }

  async getSessionStatus(): Promise<unknown | null> {
    if (!this.sessionId) return null;

    try {
      const response = await fetch(
        `${this.config.opencodeUrl}/session/${this.sessionId}`,
        {
          headers: this.getAuthHeader(),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          this.sessionId = null;
          return null;
        }
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  invalidateSession(): void {
    this.sessionId = null;
    logger.info("[OpenCodeSession] Session invalidated");
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.config.useAuth) return {};

    const credentials = Buffer.from(
      `${this.config.username}:${this.config.password}`,
    ).toString("base64");
    return { Authorization: `Basic ${credentials}` };
  }
}
