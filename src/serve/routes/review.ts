/**
 * GET /api/review/pending - List pending escalated issues.
 * POST /api/review/:issueId - Resolve an escalated issue.
 */

import type { FastifyInstance } from 'fastify';
import { IssueResolutionSchema } from '../schemas.js';
import type { IssueLog } from '../issue-log.js';

export function registerReviewRoutes(
  app: FastifyInstance,
  issueLog: IssueLog,
): void {
  app.get('/api/review/pending', async (_request, reply) => {
    const pending = issueLog.getPendingIssues();
    return reply.send({ issues: pending, total: pending.length });
  });

  app.post<{ Params: { issueId: string } }>(
    '/api/review/:issueId',
    async (request, reply) => {
      const { issueId } = request.params;

      const parseResult = IssueResolutionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parseResult.error.issues,
        });
      }

      const { answer, resolvedBy } = parseResult.data;
      const resolved = issueLog.resolveIssue(issueId, answer, resolvedBy);

      if (!resolved) {
        return reply.status(404).send({ error: `Issue ${issueId} not found` });
      }

      return reply.send({ issueId, resolved: true });
    },
  );
}
