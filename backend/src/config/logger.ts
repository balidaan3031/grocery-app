import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logs in production (parseable by any log aggregator), and
 * human-readable colourised output while developing.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'grocery-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'password',
      'access_token',
      'refresh_token',
    ],
    censor: '[redacted]',
  },
  transport: env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      },
});

export type Logger = typeof logger;
