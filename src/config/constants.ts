// Piano-specific constants

export const OPENCODE_API = {
  DEFAULT_HOST: '127.0.0.1',
  DEFAULT_PORT: 4096,
  DEFAULT_TIMEOUT_MS: 300000,
  POLLING_INTERVAL_MS: 2000,
  ENDPOINTS: {
    HEALTH: '/health',
    CHAT: '/chat',
    SESSIONS: '/sessions',
  },
} as const;
