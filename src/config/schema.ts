import { z } from 'zod';

/**
 * Helper: wraps a nested object schema so that when the field is omitted,
 * the schema's inner defaults are applied (Zod v4 `.default({})` does not
 * re-parse the default value through the inner schema).
 */
function withDefaults<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
): z.ZodPipe<z.ZodDefault<z.ZodOptional<z.ZodUnknown>>, T> {
  return z.unknown().optional().default({}).pipe(schema);
}

// ---------- Sub-schemas ----------

const ProviderSchema = z.object({
  default: z.enum(['openrouter', 'claude-code']).default('openrouter'),
  openrouter: z.object({
    apiKey: z.string().optional(),        // falls back to OPENROUTER_API_KEY env
    defaultModel: z.string().default('anthropic/claude-sonnet-4'),
  }).strict().optional(),
  claudeCode: z.object({
    binaryPath: z.string().default('claude'),
    maxTurns: z.number().int().min(1).default(5),
  }).strict().optional(),
}).strict();

const DebateModelsSchema = z.object({
  proposer: z.string().optional(),
  critic: z.string().optional(),
  judge: z.string().optional(),
}).strict();

const DebateSchema = z.object({
  rounds: z.number().int().min(1).max(10).default(3),
  engine: z.enum(['round-robin', 'judge']).default('judge'),
  convergenceThreshold: z.number().min(0).max(1).default(0.8),
  models: DebateModelsSchema.optional(),
}).strict();

const BuildSchema = z.object({
  maxConcurrency: z.number().int().min(1).max(50).default(5),
  timeout: z.number().int().min(1000).default(300_000),
}).strict();

/** Per-gate rule configuration. */
const GateRuleSchema = z.object({
  enabled: z.boolean().default(true),
  severity: z.enum(['error', 'warning', 'info']).optional(),
}).strict();

/** Per-gate configuration entry. */
const GateConfigEntrySchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(0).max(1).optional(),
  autoFix: z.boolean().optional(),
  rules: z.record(z.string(), GateRuleSchema).optional(),
}).strict();

const GateSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.8),
  autoFix: z.boolean().default(true),
  maxFixRounds: z.number().int().min(0).max(10).default(3),
  reporter: z.enum(['console', 'json', 'markdown', 'junit']).default('console'),
  gates: z.record(z.string(), GateConfigEntrySchema).default({}),
  custom: z.array(z.any()).default([]),
}).strict();

const BudgetSchema = z.object({
  perRunUsd: z.number().positive().optional(),
  perDayUsd: z.number().positive().optional(),
  perMonthUsd: z.number().positive().optional(),
}).strict();

const OutputSchema = z.object({
  directory: z.string().default('./atsf-output'),
  formats: z.array(z.enum([
    'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
  ])).default(['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack']),
}).strict();

const ServeSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(4567),
  host: z.string().default('127.0.0.1'),
  cors: z.boolean().default(true),
  llmEnabled: z.boolean().default(true),
  queryModel: z.string().optional(),
  maxChunks: z.number().int().min(1).max(50).default(10),
  issueLogFile: z.string().default('.atsf-issues.jsonl'),
  watchDebounceMs: z.number().int().min(100).default(1000),
}).strict();

const ReviewSchema = z.object({
  editor: z.string().optional(),
  autoOpenEditor: z.boolean().default(true),
  defaultSort: z.enum(['severity', 'timestamp', 'task']).default('severity'),
  pageSize: z.number().int().min(5).max(100).default(25),
}).strict();

// ---------- Top-level schema ----------

/**
 * Full ATSF configuration schema.
 * Validated with Zod v4 strict mode — unknown fields are rejected.
 *
 * Nested objects use `withDefaults()` so that inner field defaults are
 * applied even when the outer key is omitted from the config file.
 * The `provider` field is mandatory (at minimum `provider: {}` is required).
 */
export const ATSFConfigSchema = z.object({
  lang: z.enum(['en', 'tr']).default('en'),
  mode: z.enum(['free', 'budget', 'balanced', 'premium']).default('free'),
  provider: withDefaults(ProviderSchema),
  debate: withDefaults(DebateSchema),
  build: withDefaults(BuildSchema),
  gate: withDefaults(GateSchema),
  budget: withDefaults(BudgetSchema),
  output: withDefaults(OutputSchema),
  serve: withDefaults(ServeSchema),
  review: withDefaults(ReviewSchema),
}).strict();

export type ATSFConfig = z.infer<typeof ATSFConfigSchema>;

// Re-export sub-schemas for use in other modules
export { GateConfigEntrySchema, GateSchema, ServeSchema, ReviewSchema };
export type GateConfig = z.infer<typeof GateSchema>;
export type GateConfigEntry = z.infer<typeof GateConfigEntrySchema>;
