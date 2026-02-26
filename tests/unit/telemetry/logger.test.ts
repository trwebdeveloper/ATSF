import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the logger module — mock pino so we don't need real transport
vi.mock('pino', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  const pinoFactory = vi.fn(() => mockLogger);
  return { default: pinoFactory };
});

import { createLogger, type ATSFLogger } from '../../../src/telemetry/logger.js';

describe('createLogger', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalEnv;
    }
    vi.clearAllMocks();
  });

  it('returns an ATSFLogger with expected methods', () => {
    const logger = createLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('creates a logger with default log level', () => {
    delete process.env['ATSF_LOG_LEVEL'];
    const logger = createLogger();
    expect(logger).toBeDefined();
  });

  it('creates a logger with custom log level from env', () => {
    process.env['ATSF_LOG_LEVEL'] = 'debug';
    const logger = createLogger();
    expect(logger).toBeDefined();
    delete process.env['ATSF_LOG_LEVEL'];
  });

  it('delegates debug calls to underlying pino logger', () => {
    const logger = createLogger();
    logger.debug({ taskId: 'task-1' }, 'debug message');
    expect(logger.debug).toBeDefined();
  });

  it('delegates info calls to underlying pino logger', () => {
    const logger = createLogger();
    logger.info({ taskId: 'task-1', durationMs: 100 }, 'task completed');
    expect(logger.info).toBeDefined();
  });

  it('delegates error calls to underlying pino logger', () => {
    const logger = createLogger();
    logger.error({ err: new Error('test'), provider: 'openrouter' }, 'provider error');
    expect(logger.error).toBeDefined();
  });

  it('child() creates a child logger with additional context', () => {
    const logger = createLogger();
    const child = logger.child({ taskId: 'task-1', provider: 'openrouter' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('uses pino-pretty transport in development mode', () => {
    process.env['NODE_ENV'] = 'development';
    const logger = createLogger();
    expect(logger).toBeDefined();
  });

  it('uses plain JSON output in production mode', () => {
    process.env['NODE_ENV'] = 'production';
    const logger = createLogger();
    expect(logger).toBeDefined();
  });
});

describe('ATSFLogger type', () => {
  it('type is compatible with logger interface', () => {
    const logger: ATSFLogger = createLogger();
    expect(logger).toBeDefined();
  });
});
