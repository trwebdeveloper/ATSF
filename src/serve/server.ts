/**
 * Fastify HTTP server for atsf serve.
 *
 * Registers all routes, configures CORS, and manages lifecycle
 * including graceful shutdown (spec Section 15.6.1).
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ArtifactIndex } from './index/artifact-index.js';
import { QueryEngine } from './query-engine.js';
import { IssueLog } from './issue-log.js';
import { registerQueryRoute } from './routes/query.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerBlueprintRoute } from './routes/blueprint.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { registerMpdRoutes } from './routes/mpd.js';
import { registerValidateRoute } from './routes/validate.js';
import { registerReportIssueRoute } from './routes/report-issue.js';
import { registerReviewRoutes } from './routes/review.js';
import { registerStatusRoutes } from './routes/status.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface ServerOptions {
  readonly port: number;
  readonly host: string;
  readonly outputDir: string;
  readonly corsEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly issueLogFile: string;
  readonly log?: (msg: string) => void;
}

export interface ServerInstance {
  readonly app: FastifyInstance;
  readonly index: ArtifactIndex;
  readonly queryEngine: QueryEngine;
  readonly issueLog: IssueLog;
  start(): Promise<string>;
  stop(): Promise<void>;
}

// ─── createServer ────────────────────────────────────────────────────

export async function createServer(options: ServerOptions): Promise<ServerInstance> {
  const { port, host, outputDir, corsEnabled, llmEnabled, issueLogFile, log } = options;
  const startTime = Date.now();

  // Create Fastify instance
  const app = Fastify({ logger: false });

  // CORS
  if (corsEnabled) {
    await app.register(cors, { origin: true });
  }

  // Build artifact index
  const index = new ArtifactIndex(outputDir);
  await index.load();

  // Create query engine
  const queryEngine = new QueryEngine({ index, llmEnabled });

  // Create issue log
  const issueLog = new IssueLog(issueLogFile, index.crossRef);
  await issueLog.loadFromDisk();

  // Register routes
  registerQueryRoute(app, queryEngine);
  registerTaskRoutes(app, index);
  registerBlueprintRoute(app, index);
  registerDecisionRoutes(app, index);
  registerMpdRoutes(app, index);
  registerValidateRoute(app, index);
  registerReportIssueRoute(app, issueLog);
  registerReviewRoutes(app, issueLog);
  registerStatusRoutes(app, { index, issueLog, startTime });

  const instance: ServerInstance = {
    app,
    index,
    queryEngine,
    issueLog,

    async start(): Promise<string> {
      const address = await app.listen({ port, host });
      if (log) {
        log(`ATSF server listening on ${address}`);
        log(`  Output directory: ${outputDir}`);
        log(`  Indexed chunks: ${index.chunksCount}`);
        log(`  LLM synthesis: ${llmEnabled ? 'enabled' : 'disabled'}`);
      }
      return address;
    },

    async stop(): Promise<void> {
      // Graceful shutdown (spec Section 15.6.1):
      // 1. Close Fastify (stop accepting new connections, drain active)
      await app.close();

      // 2. Flush IssueLog to JSONL
      await issueLog.flush();

      if (log) {
        log('ATSF server stopped');
      }
    },
  };

  return instance;
}

// ─── Graceful shutdown helper ────────────────────────────────────────

/**
 * Register SIGINT/SIGTERM handlers for graceful shutdown.
 *
 * Spec Section 15.6.1:
 * 1. fastify.close() - stop accepting new connections (10s timeout)
 * 2. Flush IssueLog to .atsf-issues.jsonl
 * 3. Cleanup resilience timers
 * 4. Close chokidar watcher if active
 * 5. Exit with code 0
 *
 * Force exit after 15 seconds.
 */
export function registerGracefulShutdown(
  server: ServerInstance,
  log?: (msg: string) => void,
): void {
  let shuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (log) log('Shutting down...');

    // Force exit after 15 seconds
    const forceTimer = setTimeout(() => {
      if (log) log('Force exit after 15s timeout');
      process.exit(1);
    }, 15000);
    // Unref so it doesn't keep the process alive
    forceTimer.unref();

    try {
      await server.stop();
      if (log) log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      if (log) log(`Shutdown error: ${err}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
