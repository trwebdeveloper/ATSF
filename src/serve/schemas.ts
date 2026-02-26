/**
 * Zod schemas for all serve request/response types (spec Section 15.4).
 *
 * These schemas define the contracts for the HTTP API and MCP bridge.
 */

import { z } from 'zod';

// ─── Shared Enums ────────────────────────────────────────────────────

export const IssueCategorySchema = z.enum([
  'ambiguous_spec',
  'missing_detail',
  'dependency_conflict',
  'infeasible_constraint',
  'schema_mismatch',
  'needs_human_judgment',
]);

export const IssueSeveritySchema = z.enum([
  'critical',
  'major',
  'minor',
  'suggestion',
]);

export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);

export const ArtifactTypeFilterSchema = z.enum([
  'task_graph',
  'repo_blueprint',
  'mpd',
  'tickets',
  'ai_prompt_pack',
]);

// ─── POST /api/query ─────────────────────────────────────────────────

export const QueryRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  taskId: z
    .string()
    .regex(/^TASK-\d{3,}$/)
    .optional(),
  artifactTypes: z.array(ArtifactTypeFilterSchema).optional(),
  rawContext: z.boolean().default(false),
  maxChunks: z.number().int().min(1).max(20).default(5),
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const SourceRefSchema = z.object({
  file: z.string(),
  artifactType: z.string(),
  path: z.string().optional(),
});

export const ChunkSchema = z.object({
  content: z.string(),
  score: z.number(),
  source: SourceRefSchema,
});

export const EscalationSchema = z.object({
  issueId: z.string(),
  category: IssueCategorySchema,
  suggestedActions: z.array(z.string()),
  blockedTaskIds: z.array(z.string()),
});

export const TokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const QueryResponseSchema = z
  .object({
    answer: z.string(),
    confidence: ConfidenceLevelSchema,
    answerable: z.boolean(),
    escalation: EscalationSchema.optional(),
    sources: z.array(SourceRefSchema),
    chunks: z.array(ChunkSchema),
    relatedTasks: z.array(z.string()),
    llmUsed: z.boolean(),
    tokenUsage: TokenUsageSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.answerable && !val.escalation) {
      ctx.addIssue({
        code: 'custom',
        path: ['escalation'],
        message: 'escalation is required when answerable is false',
      });
    }
  });

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ─── POST /api/validate ──────────────────────────────────────────────

export const ValidateRequestSchema = z.object({
  taskId: z.string().regex(/^TASK-\d{3,}$/),
  filePath: z.string(),
  content: z.string(),
});

export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;

export const ValidationErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
});

export const ValidationWarningSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationWarningSchema),
  contract: z.object({
    taskId: z.string(),
    expectedFile: z.string(),
    contractSection: z.string().optional(),
  }),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ─── POST /api/report-issue ──────────────────────────────────────────

export const ReportIssueRequestSchema = z.object({
  taskId: z.string().regex(/^TASK-\d{3,}$/),
  severity: IssueSeveritySchema,
  category: IssueCategorySchema,
  summary: z.string().min(1).max(500),
  description: z.string().max(5000),
  codeSnippet: z.string().max(2000).optional(),
  filePath: z.string().optional(),
  reporter: z.string().default('unknown'),
});

export type ReportIssueRequest = z.infer<typeof ReportIssueRequestSchema>;

export const RelatedIssueSchema = z.object({
  issueId: z.string(),
  taskId: z.string(),
  summary: z.string(),
  similarity: z.number().min(0).max(1),
});

export const PossibleCauseSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  reason: z.string(),
});

export const ReportIssueResponseSchema = z.object({
  issueId: z.string(),
  hasSuggestion: z.boolean(),
  suggestion: z.string().optional(),
  relatedIssues: z.array(RelatedIssueSchema),
  possibleCauses: z.array(PossibleCauseSchema),
});

export type ReportIssueResponse = z.infer<typeof ReportIssueResponseSchema>;

// ─── GET /api/status ─────────────────────────────────────────────────

export const StatusResponseSchema = z.object({
  projectName: z.string(),
  totalTasks: z.number().int().nonnegative(),
  artifactsLoaded: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  uptime: z.number().nonnegative(),
});

export type StatusResponse = z.infer<typeof StatusResponseSchema>;

// ─── GET /health ─────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
});

// ─── Issue Resolution (for POST /api/review/:issueId) ────────────────

export const IssueResolutionSchema = z.object({
  answer: z.string().min(1).max(5000),
  resolvedBy: z.string().default('human'),
});

export type IssueResolution = z.infer<typeof IssueResolutionSchema>;

// ─── Stored Issue Shape ──────────────────────────────────────────────

export const StoredIssueSchema = z.object({
  issueId: z.string(),
  taskId: z.string(),
  severity: IssueSeveritySchema,
  category: IssueCategorySchema,
  summary: z.string(),
  description: z.string(),
  codeSnippet: z.string().optional(),
  filePath: z.string().optional(),
  reporter: z.string(),
  createdAt: z.string(),
  resolved: z.boolean(),
  resolution: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
});

export type StoredIssue = z.infer<typeof StoredIssueSchema>;

// ─── Chunk Type (for indexing) ───────────────────────────────────────

export interface IndexedChunk {
  readonly id: number;
  readonly content: string;
  readonly source: {
    readonly file: string;
    readonly artifactType: string;
    readonly path?: string;
  };
  readonly taskIds: readonly string[];
}
