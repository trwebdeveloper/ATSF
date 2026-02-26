/**
 * GET /api/blueprint - Get repository blueprint.
 */

import type { FastifyInstance } from 'fastify';
import type { ArtifactIndex } from '../index/artifact-index.js';

export function registerBlueprintRoute(
  app: FastifyInstance,
  index: ArtifactIndex,
): void {
  app.get('/api/blueprint', async (_request, reply) => {
    const blueprint = index.artifacts.repoBlueprint;
    if (!blueprint) {
      return reply.status(404).send({ error: 'Repository blueprint not found' });
    }
    return reply.send({ blueprint });
  });
}
