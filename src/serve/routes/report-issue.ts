/**
 * POST /api/report-issue - Report implementation issue.
 */

import type { FastifyInstance } from 'fastify';
import { ReportIssueRequestSchema } from '../schemas.js';
import type { IssueLog } from '../issue-log.js';

export function registerReportIssueRoute(
  app: FastifyInstance,
  issueLog: IssueLog,
): void {
  app.post('/api/report-issue', async (request, reply) => {
    const parseResult = ReportIssueRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const response = await issueLog.reportIssue(parseResult.data);
    return reply.status(201).send(response);
  });
}
