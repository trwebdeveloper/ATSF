/**
 * GET /api/tasks - List all tasks with filtering and pagination.
 * GET /api/tasks/:id - Get detailed task information.
 * GET /api/tasks/:id/prompt - Get AI prompt pack for a task.
 * GET /api/tasks/:id/ticket - Get ticket for a task.
 * GET /api/tasks/:id/deps - Get task dependency graph.
 */

import type { FastifyInstance } from 'fastify';
import type { ArtifactIndex } from '../index/artifact-index.js';

export function registerTaskRoutes(
  app: FastifyInstance,
  index: ArtifactIndex,
): void {
  // GET /api/tasks
  app.get('/api/tasks', async (_request, reply) => {
    const taskIds = index.crossRef.getAllTaskIds();
    const tasks = taskIds.map((id) => {
      const entry = index.crossRef.getTask(id);
      return {
        id,
        filesWrite: entry?.filesWrite ?? [],
        filesRead: entry?.filesRead ?? [],
        dependsOn: entry?.dependsOn ?? [],
      };
    });
    return reply.send({ tasks, total: tasks.length });
  });

  // GET /api/tasks/:id
  app.get<{ Params: { id: string } }>(
    '/api/tasks/:id',
    async (request, reply) => {
      const { id } = request.params;
      const entry = index.crossRef.getTask(id);
      if (!entry) {
        return reply.status(404).send({ error: `Task ${id} not found` });
      }

      const related = index.crossRef.getRelatedTasks(id);
      return reply.send({ ...entry, relatedTasks: related });
    },
  );

  // GET /api/tasks/:id/prompt
  app.get<{ Params: { id: string } }>(
    '/api/tasks/:id/prompt',
    async (request, reply) => {
      const { id } = request.params;
      const promptPack = index.artifacts.aiPromptPack;

      // Find prompt file for this task
      for (const [filename, content] of promptPack) {
        if (filename.includes(id) || content.includes(id)) {
          return reply.send({ taskId: id, prompt: content });
        }
      }

      return reply.status(404).send({ error: `Prompt pack for ${id} not found` });
    },
  );

  // GET /api/tasks/:id/ticket
  app.get<{ Params: { id: string } }>(
    '/api/tasks/:id/ticket',
    async (request, reply) => {
      const { id } = request.params;
      const tickets = index.artifacts.tickets;

      // Find ticket file for this task
      for (const [filename, content] of tickets) {
        if (filename.includes(id) || content.includes(id)) {
          return reply.send({ taskId: id, ticket: content });
        }
      }

      return reply.status(404).send({ error: `Ticket for ${id} not found` });
    },
  );

  // GET /api/tasks/:id/deps
  app.get<{ Params: { id: string } }>(
    '/api/tasks/:id/deps',
    async (request, reply) => {
      const { id } = request.params;
      const entry = index.crossRef.getTask(id);
      if (!entry) {
        return reply.status(404).send({ error: `Task ${id} not found` });
      }

      const upstream = index.crossRef.getUpstreamTasks(id);
      return reply.send({
        taskId: id,
        directDeps: entry.dependsOn,
        transitiveDeps: upstream,
      });
    },
  );
}
