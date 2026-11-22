import { pino, type Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';

export type { Logger };

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'nodeEnv'>): Logger {
  return pino({
    level: config.nodeEnv === 'test' ? 'silent' : config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.temporaryPassword',
        '*.currentPassword',
        '*.newPassword',
      ],
      censor: '[redacted]',
    },
  });
}
