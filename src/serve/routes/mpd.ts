/**
 * GET /api/mpd - Get full MPD.
 * GET /api/mpd/:section - Get specific MPD section.
 */

import type { FastifyInstance } from 'fastify';
import type { ArtifactIndex } from '../index/artifact-index.js';

export function registerMpdRoutes(
  app: FastifyInstance,
  index: ArtifactIndex,
): void {
  app.get('/api/mpd', async (_request, reply) => {
    const mpd = index.artifacts.mpd;
    if (!mpd) {
      return reply.status(404).send({ error: 'MPD not found' });
    }
    return reply.send({ mpd });
  });

  app.get<{ Params: { section: string } }>(
    '/api/mpd/:section',
    async (request, reply) => {
      const { section } = request.params;
      const mpd = index.artifacts.mpd;
      if (!mpd) {
        return reply.status(404).send({ error: 'MPD not found' });
      }

      // Find section by title match
      const sections = mpd.split(/^## /m);
      const match = sections.find((s) => {
        const firstNewline = s.indexOf('\n');
        const title = (firstNewline >= 0 ? s.slice(0, firstNewline) : s)
          .trim()
          .toLowerCase();
        return title.includes(section.toLowerCase());
      });

      if (!match) {
        return reply.status(404).send({ error: `MPD section "${section}" not found` });
      }

      const firstNewline = match.indexOf('\n');
      const title = firstNewline >= 0 ? match.slice(0, firstNewline).trim() : match.trim();

      return reply.send({
        section: title,
        content: `## ${match}`,
      });
    },
  );
}
