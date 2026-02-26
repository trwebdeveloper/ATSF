/**
 * MCP Server Bridge: wraps HTTP API routes as MCP tools via stdio transport.
 *
 * Spec Section 15.8: MCP Server Bridge.
 *
 * Each MCP tool mirrors the corresponding HTTP endpoint schema.
 */

import type { ServerInstance } from './server.js';
import type { QueryRequest } from './schemas.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  handler(input: Record<string, unknown>): Promise<unknown>;
}

export interface McpBridge {
  readonly tools: ReadonlyArray<McpTool>;
  handleToolCall(name: string, input: Record<string, unknown>): Promise<unknown>;
}

// ─── createMcpBridge ─────────────────────────────────────────────────

export function createMcpBridge(server: ServerInstance): McpBridge {
  const { queryEngine, index, issueLog } = server;

  const tools: McpTool[] = [
    {
      name: 'query_project',
      description: 'Ask a natural language question about the project',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Natural language question' },
          taskId: { type: 'string', description: 'Optional task ID to scope the query' },
          rawContext: { type: 'boolean', description: 'Return raw context without LLM synthesis' },
          maxChunks: { type: 'number', description: 'Maximum number of chunks to return' },
        },
        required: ['question'],
      },
      async handler(input) {
        return queryEngine.query(input as QueryRequest);
      },
    },
    {
      name: 'get_task',
      description: 'Get detailed task information',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID (e.g., TASK-001)' },
        },
        required: ['taskId'],
      },
      async handler(input) {
        const results = index.structuredMatch(input.taskId as string);
        return results.length > 0 ? results[0] : { error: 'Task not found' };
      },
    },
    {
      name: 'get_task_prompt',
      description: 'Get the AI prompt pack for a task',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
        },
        required: ['taskId'],
      },
      async handler(input) {
        const tid = input.taskId as string;
        for (const [file, content] of index.artifacts.aiPromptPack) {
          if (file.includes(tid)) return { taskId: tid, file, content };
        }
        return { error: 'Prompt pack not found for task' };
      },
    },
    {
      name: 'list_tasks',
      description: 'List all tasks with status and dependencies',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        const taskIds = index.crossRef.getAllTaskIds();
        return taskIds.map((id) => {
          const task = index.crossRef.getTask(id);
          return { taskId: id, dependsOn: task?.dependsOn ?? [] };
        });
      },
    },
    {
      name: 'get_blueprint',
      description: 'Get the repository file structure',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        return index.artifacts.repoBlueprint ?? { error: 'Blueprint not available' };
      },
    },
    {
      name: 'get_decision',
      description: 'Get a specific architecture decision record',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Decision ID or search term' },
        },
        required: ['id'],
      },
      async handler(input) {
        const results = index.search(input.id as string, 3);
        return results.filter((c) => c.source.artifactType === 'mpd');
      },
    },
    {
      name: 'report_issue',
      description: 'Report an implementation issue or blocker',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'suggestion'] },
          category: { type: 'string' },
          summary: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['taskId', 'severity', 'category', 'summary', 'description'],
      },
      async handler(input) {
        return issueLog.reportIssue(input as Parameters<typeof issueLog.reportIssue>[0]);
      },
    },
    {
      name: 'list_pending_reviews',
      description: 'List escalated issues pending human review',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        return issueLog.getPendingIssues();
      },
    },
    {
      name: 'submit_review_answer',
      description: 'Submit an answer to an escalated question',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          answer: { type: 'string' },
          resolvedBy: { type: 'string' },
        },
        required: ['issueId', 'answer'],
      },
      async handler(input) {
        const ok = issueLog.resolveIssue(
          input.issueId as string,
          input.answer as string,
          (input.resolvedBy as string) ?? 'human',
        );
        return { success: ok };
      },
    },
    {
      name: 'get_project_status',
      description: 'Get overall project implementation status',
      inputSchema: { type: 'object', properties: {} },
      async handler() {
        return {
          totalTasks: index.crossRef.getAllTaskIds().length,
          indexedChunks: index.chunksCount,
          openIssues: issueLog.getPendingIssues().length,
        };
      },
    },
  ];

  return {
    tools,
    async handleToolCall(name: string, input: Record<string, unknown>): Promise<unknown> {
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        throw new Error(`Unknown MCP tool: ${name}`);
      }
      return tool.handler(input);
    },
  };
}
