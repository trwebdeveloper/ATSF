/**
 * GET /api/decisions - List architecture decisions.
 * GET /api/decisions/:id - Get specific ADR details.
 */

import type { FastifyInstance } from 'fastify';
import type { ArtifactIndex } from '../index/artifact-index.js';

export function registerDecisionRoutes(
  app: FastifyInstance,
  index: ArtifactIndex,
): void {
  app.get('/api/decisions', async (_request, reply) => {
    // Extract decisions from MPD if available
    const mpd = index.artifacts.mpd;
    if (!mpd) {
      return reply.send({ decisions: [] });
    }

    // Parse H2 sections that look like ADRs
    const sections = mpd.split(/^## /m);
    const decisions = sections
      .filter((s) => s.trim())
      .map((s, i) => {
        const firstNewline = s.indexOf('\n');
        const title = firstNewline >= 0 ? s.slice(0, firstNewline).trim() : s.trim();
        return {
          id: `ADR-${String(i + 1).padStart(3, '0')}`,
          title,
          content: `## ${s}`,
        };
      });

    return reply.send({ decisions });
  });

  app.get<{ Params: { id: string } }>(
    '/api/decisions/:id',
    async (request, reply) => {
      const { id } = request.params;
      const mpd = index.artifacts.mpd;
      if (!mpd) {
        return reply.status(404).send({ error: `Decision ${id} not found` });
      }

      const sections = mpd.split(/^## /m);
      const idx = parseInt(id.replace(/^ADR-0*/, ''), 10) - 1;

      if (isNaN(idx) || idx < 0 || idx >= sections.filter((s) => s.trim()).length) {
        return reply.status(404).send({ error: `Decision ${id} not found` });
      }

      const section = sections.filter((s) => s.trim())[idx];
      const firstNewline = section.indexOf('\n');
      const title = firstNewline >= 0 ? section.slice(0, firstNewline).trim() : section.trim();

      return reply.send({
        id,
        title,
        content: `## ${section}`,
      });
    },
  );
}
