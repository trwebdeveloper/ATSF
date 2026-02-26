/**
 * POST /api/validate - Validate AI coder output against expected contract.
 */

import type { FastifyInstance } from 'fastify';
import { ValidateRequestSchema } from '../schemas.js';
import type { ArtifactIndex } from '../index/artifact-index.js';

export function registerValidateRoute(
  app: FastifyInstance,
  index: ArtifactIndex,
): void {
  app.post('/api/validate', async (request, reply) => {
    const parseResult = ValidateRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { taskId, filePath, content } = parseResult.data;

    // Check task exists
    const task = index.crossRef.getTask(taskId);
    if (!task) {
      return reply.send({
        valid: false,
        errors: [
          {
            path: 'taskId',
            message: `Task ${taskId} not found`,
            severity: 'error',
          },
        ],
        warnings: [],
        contract: { taskId, expectedFile: filePath },
      });
    }

    // Check file is in task's filesWrite
    const expectedFiles = task.filesWrite;
    const fileInScope = expectedFiles.some(
      (f) => f === filePath || filePath.endsWith(f) || f.endsWith(filePath),
    );

    const errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }> = [];
    const warnings: Array<{ path: string; message: string }> = [];

    if (!fileInScope) {
      warnings.push({
        path: filePath,
        message: `File ${filePath} is not in the expected output files for ${taskId}`,
      });
    }

    // Basic content validation
    if (!content.trim()) {
      errors.push({
        path: filePath,
        message: 'File content is empty',
        severity: 'error',
      });
    }

    return reply.send({
      valid: errors.length === 0,
      errors,
      warnings,
      contract: {
        taskId,
        expectedFile: filePath,
      },
    });
  });
}
