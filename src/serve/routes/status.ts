/**
 * GET /api/status - Project implementation status dashboard.
 * GET /health - Server health check.
 */

import type { FastifyInstance } from 'fastify';
import type { ArtifactIndex } from '../index/artifact-index.js';
import type { IssueLog } from '../issue-log.js';

export interface StatusRouteContext {
  readonly index: ArtifactIndex;
  readonly issueLog: IssueLog;
  readonly startTime: number;
}

export function registerStatusRoutes(
  app: FastifyInstance,
  ctx: StatusRouteContext,
): void {
  app.get('/api/status', async (_request, reply) => {
    const taskIds = ctx.index.crossRef.getAllTaskIds();
    const uptime = (Date.now() - ctx.startTime) / 1000;

    return reply.send({
      projectName: 'ATSF Project',
      totalTasks: taskIds.length,
      artifactsLoaded: countArtifacts(ctx.index),
      indexedChunks: ctx.index.chunksCount,
      openIssues: ctx.issueLog.getPendingIssues().length,
      uptime,
    });
  });

  app.get('/health', async (_request, reply) => {
    const uptime = (Date.now() - ctx.startTime) / 1000;
    return reply.send({ status: 'ok', uptime });
  });
}

function countArtifacts(index: ArtifactIndex): number {
  let count = 0;
  if (index.artifacts.taskGraph) count++;
  if (index.artifacts.repoBlueprint) count++;
  if (index.artifacts.mpd) count++;
  count += index.artifacts.tickets.size;
  count += index.artifacts.aiPromptPack.size;
  if (index.artifacts.manifest) count++;
  return count;
}
