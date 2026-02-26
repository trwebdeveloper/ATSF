/**
 * POST /api/query - Natural language Q&A about the project.
 */

import type { FastifyInstance } from 'fastify';
import { QueryRequestSchema } from '../schemas.js';
import type { QueryEngine } from '../query-engine.js';

export function registerQueryRoute(
  app: FastifyInstance,
  queryEngine: QueryEngine,
): void {
  app.post('/api/query', async (request, reply) => {
    const parseResult = QueryRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const response = await queryEngine.query(parseResult.data);
    return reply.send(response);
  });
}
