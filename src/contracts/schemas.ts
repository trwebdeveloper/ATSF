/**
 * Agent Output Contract Schemas — T09
 *
 * Implements the 9-field agent output schema per Section 8.2,
 * with cross-field validation via .superRefine() per Section 8.3.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Per-record-type schemas                                            */
/* ------------------------------------------------------------------ */

export const AssumptionSchema = z.object({
  id: z.string().regex(/^ASMP-\d{3}$/),
  description: z.string().min(10),
  source: z.enum(['user', 'inferred', 'domain']),
  confidence: z.number().min(0).max(1),
  validatedBy: z.string().nullable(),
});

export const FindingSchema = z.object({
  id: z.string().regex(/^FIND-\d{3}$/),
  description: z.string().min(10),
  evidence: z.array(z.string()).min(1),
  assumptionRefs: z.array(z.string().regex(/^ASMP-\d{3}$/)),
  severity: z.enum(['critical', 'major', 'minor', 'info']),
});

/**
 * AgentDecisionSchema — agent output DEC-NNN records.
 * NOTE: The debate engine uses a separate DebateDecisionSchema (Section 6.8.3)
 * for the judge's Decision output (Section 6.2). Do not confuse the two.
 */
export const DecisionSchema = z.object({
  id: z.string().regex(/^DEC-\d{3}$/),
  title: z.string().min(5),
  findingRef: z.string().regex(/^FIND-\d{3}$/),
  chosenOption: z.string(),
  rationale: z.string().min(20),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated']),
});

export const RecommendationSchema = z.object({
  id: z.string().regex(/^REC-\d{3}$/),
  description: z.string().min(10),
  decisionRef: z.string().regex(/^DEC-\d{3}$/),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  effort: z.enum(['trivial', 'small', 'medium', 'large', 'epic']),
});

export const RiskSchema = z.object({
  id: z.string().regex(/^RISK-\d{3}$/),
  description: z.string().min(10),
  probability: z.enum(['high', 'medium', 'low']),
  impact: z.enum(['critical', 'major', 'minor']),
  mitigation: z.string(),
});

export const ConstraintSchema = z.object({
  id: z.string().regex(/^CNST-\d{3}$/),
  description: z.string().min(10),
  type: z.enum(['technical', 'business', 'regulatory', 'resource']),
  source: z.string(),
});

export const DependencySchema = z.object({
  id: z.string().regex(/^DEP-\d{3}$/),
  name: z.string(),
  version: z.string(),
  purpose: z.string(),
  license: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
});

export const InterfaceContractSchema = z.object({
  id: z.string().regex(/^INTF-\d{3}$/),
  name: z.string(),
  type: z.enum(['api', 'event', 'file', 'database']),
  schema: z.string(), // Serialized Zod/JSON schema
  producer: z.string(),
  consumers: z.array(z.string()),
});

export const MetadataSchema = z.object({
  agentId: z.string(),
  agentType: z.string(),
  timestamp: z.string().datetime(),
  model: z.string(),
  tokenUsage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  duration: z.number().nonnegative(),
});

/* ------------------------------------------------------------------ */
/*  AgentOutputSchema — the complete 9-field contract                  */
/* ------------------------------------------------------------------ */

/**
 * The complete 9-field agent output contract.
 * Every agent must produce output conforming to this schema.
 */
export const AgentOutputSchema = z.object({
  assumptions: z.array(AssumptionSchema),
  findings: z.array(FindingSchema),
  decisions: z.array(DecisionSchema),
  recommendations: z.array(RecommendationSchema),
  risks: z.array(RiskSchema),
  constraints: z.array(ConstraintSchema),
  dependencies: z.array(DependencySchema),
  interfaces: z.array(InterfaceContractSchema),
  metadata: MetadataSchema,
});

/* ------------------------------------------------------------------ */
/*  ValidatedAgentOutputSchema — cross-field referential integrity     */
/* ------------------------------------------------------------------ */

/**
 * Cross-field validation via .superRefine() per Section 8.3.
 *
 * Zod v4 behavior: if base object field validation fails,
 * .superRefine() is NOT triggered. This is desirable — do not
 * check referential integrity on structurally malformed data.
 */
export const ValidatedAgentOutputSchema = AgentOutputSchema.superRefine((data, ctx) => {
  // Verify decision->finding referential integrity
  const findingIds = new Set(data.findings.map((f) => f.id));
  for (const decision of data.decisions) {
    if (!findingIds.has(decision.findingRef)) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisions'],
        message: `Decision ${decision.id} references non-existent finding ${decision.findingRef}`,
      });
    }
  }

  // Verify finding->assumption referential integrity
  const assumptionIds = new Set(data.assumptions.map((a) => a.id));
  for (const finding of data.findings) {
    for (const ref of finding.assumptionRefs) {
      if (!assumptionIds.has(ref)) {
        ctx.addIssue({
          code: 'custom',
          path: ['findings'],
          message: `Finding ${finding.id} references non-existent assumption ${ref}`,
        });
      }
    }
  }

  // Verify recommendation->decision referential integrity
  const decisionIds = new Set(data.decisions.map((d) => d.id));
  for (const rec of data.recommendations) {
    if (!decisionIds.has(rec.decisionRef)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recommendations'],
        message: `Recommendation ${rec.id} references non-existent decision ${rec.decisionRef}`,
      });
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Type exports                                                       */
/* ------------------------------------------------------------------ */

export type Assumption = z.infer<typeof AssumptionSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type InterfaceContract = z.infer<typeof InterfaceContractSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
