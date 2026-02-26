import pino from 'pino';

/**
 * Structured log object fields for ATSF log entries.
 * All fields are optional to allow flexible contextual logging.
 */
export interface LogFields {
  readonly taskId?: string;
  readonly provider?: string;
  readonly eventType?: string;
  readonly durationMs?: number;
  readonly tokenUsage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly err?: Error | unknown;
  readonly [key: string]: unknown;
}

/**
 * ATSF structured logger interface wrapping pino.
 * Provides three-tier log levels: debug, info, error.
 * All log entries support structured fields for observability.
 */
export interface ATSFLogger {
  debug(fields: LogFields, message: string): void;
  debug(message: string): void;
  info(fields: LogFields, message: string): void;
  info(message: string): void;
  warn(fields: LogFields, message: string): void;
  warn(message: string): void;
  error(fields: LogFields, message: string): void;
  error(message: string): void;
  child(fields: LogFields): ATSFLogger;
}

/**
 * Creates a configured pino logger instance for ATSF.
 *
 * - In development (NODE_ENV=development), uses pino-pretty for human-readable output.
 * - In all other environments, uses structured JSON output.
 * - Log level is controlled by ATSF_LOG_LEVEL env var (default: 'info').
 */
export function createLogger(): ATSFLogger {
  const level = process.env['ATSF_LOG_LEVEL'] ?? 'info';
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  const pinoOptions: pino.LoggerOptions = {
    level,
    transport: isDevelopment
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  };

  const pinoLogger = pino(pinoOptions);

  function wrapPino(instance: pino.Logger): ATSFLogger {
    return {
      debug(fieldsOrMessage: LogFields | string, message?: string): void {
        if (typeof fieldsOrMessage === 'string') {
          instance.debug(fieldsOrMessage);
        } else {
          instance.debug(fieldsOrMessage, message ?? '');
        }
      },

      info(fieldsOrMessage: LogFields | string, message?: string): void {
        if (typeof fieldsOrMessage === 'string') {
          instance.info(fieldsOrMessage);
        } else {
          instance.info(fieldsOrMessage, message ?? '');
        }
      },

      warn(fieldsOrMessage: LogFields | string, message?: string): void {
        if (typeof fieldsOrMessage === 'string') {
          instance.warn(fieldsOrMessage);
        } else {
          instance.warn(fieldsOrMessage, message ?? '');
        }
      },

      error(fieldsOrMessage: LogFields | string, message?: string): void {
        if (typeof fieldsOrMessage === 'string') {
          instance.error(fieldsOrMessage);
        } else {
          instance.error(fieldsOrMessage, message ?? '');
        }
      },

      child(fields: LogFields): ATSFLogger {
        return wrapPino(instance.child(fields as Record<string, unknown>));
      },
    };
  }

  return wrapPino(pinoLogger);
}

/**
 * Default singleton logger for application-wide use.
 * Modules that need contextual loggers should call logger.child({...}).
 */
export const logger: ATSFLogger = createLogger();
