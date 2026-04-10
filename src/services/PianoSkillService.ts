import type { SessionMessage } from '../services/OpenCodeSessionManager.js';

export interface PianoSkillConfig {
  openCodeUrl: string;
  auth?: {
    username: string;
    password: string;
  };
}

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
}

export class PianoSkillService {
  private config: PianoSkillConfig;
  private authHeader: Record<string, string> = {};

  constructor(config: PianoSkillConfig) {
    this.config = config;
    if (config.auth?.username && config.auth?.password) {
      const credentials = Buffer.from(
        `${config.auth.username}:${config.auth.password}`
      ).toString('base64');
      this.authHeader = { 'Authorization': `Basic ${credentials}` };
    }
  }

  async listSkills(): Promise<SkillInfo[]> {
    try {
      const response = await fetch(`${this.config.openCodeUrl}/skill`, {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list skills: ${response.status}`);
      }

      const skills = await response.json() as SkillInfo[];
      console.log(`[PianoSkill] Found ${skills.length} skills`);
      return skills;
    } catch (error) {
      console.error('[PianoSkill] Failed to list skills:', error);
      return [];
    }
  }

  async loadSkill(sessionId: string, skillName: string): Promise<boolean> {
    try {
      const toolCall = {
        name: 'skill',
        arguments: { name: skillName },
      };

      const response = await fetch(
        `${this.config.openCodeUrl}/session/${sessionId}/tool`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeader,
          },
          body: JSON.stringify({
            toolCall: {
              id: `skill-${Date.now()}`,
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load skill: ${response.status}`);
      }

      console.log(`[PianoSkill] Loaded skill: ${skillName}`);
      return true;
    } catch (error) {
      console.error('[PianoSkill] Failed to load skill:', error);
      return false;
    }
  }

  async sendWithSkill(sessionId: string, message: string, skillName?: string): Promise<void> {
    if (skillName) {
      await this.loadSkill(sessionId, skillName);
    }

    const sessionMessage: SessionMessage = {
      parts: [{ type: 'text', text: message }],
    };

    const response = await fetch(
      `${this.config.openCodeUrl}/session/${sessionId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader,
        },
        body: JSON.stringify(sessionMessage),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }
  }
}

export function createPianoSkillService(config: PianoSkillConfig): PianoSkillService {
  return new PianoSkillService(config);
}