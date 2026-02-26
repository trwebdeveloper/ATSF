/**
 * Escalation Detector: pure-function module for escalation detection.
 *
 * Spec Section 15.13.2: Escalation Detection Algorithm.
 *
 * Rules evaluated in order; first match wins.
 * Provides ESCALATION_RULES, CATEGORY_SEVERITY_MAP, buildQueryEscalation().
 */

import { randomUUID } from 'node:crypto';
import type { QueryRequest } from './schemas.js';

// ─── Types ───────────────────────────────────────────────────────────

export type EscalationCategory =
  | 'ambiguous_spec'
  | 'missing_detail'
  | 'dependency_conflict'
  | 'infeasible_constraint'
  | 'schema_mismatch'
  | 'needs_human_judgment';

export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface EscalationDecision {
  readonly answerable: boolean;
  readonly category?: EscalationCategory;
  readonly reason?: string;
}

export interface EscalationContext {
  readonly topScore: number;
  readonly conflictDetected: boolean;
  readonly llmConfidence: 'high' | 'medium' | 'low';
  readonly llmUsed: boolean;
  readonly depConflict: boolean;
}

export interface EscalationRule {
  readonly condition: (ctx: EscalationContext) => boolean;
  readonly category: EscalationCategory;
}

export interface EscalatedIssueRecord {
  readonly issueId: string;
  readonly taskId: string;
  readonly severity: IssueSeverity;
  readonly category: string;
  readonly summary: string;
  readonly description: string;
  readonly reporter: string;
  readonly createdAt: string;

  // Escalation fields
  readonly escalatedFrom?: string;
  readonly answerable: boolean;
  readonly escalationCategory?: EscalationCategory;
  readonly suggestedActions: readonly string[];
  readonly blockedTaskIds: readonly string[];

  // Resolution fields (populated when resolved)
  readonly status: 'pending' | 'answered' | 'dismissed' | 'deferred';
  readonly resolution?: unknown;
  readonly resolvedAt?: string;
}

// ─── Category → Severity Mapping ─────────────────────────────────────

/**
 * Maps escalation categories to severity levels.
 * Spec Section 15.13.2 Category → Severity mapping.
 */
export const CATEGORY_SEVERITY_MAP: Record<EscalationCategory, IssueSeverity> = {
  infeasible_constraint: 'critical',
  schema_mismatch: 'critical',
  dependency_conflict: 'major',
  ambiguous_spec: 'major',
  missing_detail: 'minor',
  needs_human_judgment: 'minor',
};

// ─── Escalation Rules ────────────────────────────────────────────────

/**
 * Escalation rules applied after BM25 retrieval and optional LLM synthesis.
 * Rules are evaluated in order; first match wins.
 *
 * Spec Section 15.13.2.
 */
export const ESCALATION_RULES: readonly EscalationRule[] = [
  // Rule 1: No relevant context found
  { condition: (ctx) => ctx.topScore < 2.0, category: 'missing_detail' },

  // Rule 2: Conflicting chunks (contradictory content in top results)
  { condition: (ctx) => ctx.conflictDetected, category: 'ambiguous_spec' },

  // Rule 3: LLM synthesis explicitly flags uncertainty
  {
    condition: (ctx) => ctx.llmConfidence === 'low' && ctx.llmUsed,
    category: 'needs_human_judgment',
  },

  // Rule 4: Cross-reference conflict in task dependencies
  { condition: (ctx) => ctx.depConflict, category: 'dependency_conflict' },
];

// ─── Suggested Actions ───────────────────────────────────────────────

/**
 * Derive suggested actions based on escalation category.
 */
export function deriveSuggestedActions(category: EscalationCategory): string[] {
  switch (category) {
    case 'missing_detail':
      return [
        'Add the missing detail to the project spec',
        'Rephrase the question with more specific terms',
        'Specify a task ID to scope the search',
      ];
    case 'ambiguous_spec':
      return [
        'Clarify the spec to resolve conflicting sections',
        'Choose one approach and update the spec',
        'Create an ADR documenting the decision',
      ];
    case 'dependency_conflict':
      return [
        'Review task dependencies for circular or contradictory requirements',
        'Update task dependency graph to resolve conflict',
        'Split conflicting tasks into separate concerns',
      ];
    case 'infeasible_constraint':
      return [
        'Review technical constraints for feasibility',
        'Relax one of the conflicting requirements',
        'Consult with technical lead on architecture trade-offs',
      ];
    case 'schema_mismatch':
      return [
        'Align the contract schema with the actual output format',
        'Update field naming conventions across the spec',
        'Review auto-fix rules for schema normalization',
      ];
    case 'needs_human_judgment':
      return [
        'Consult with domain expert or product owner',
        'Document the decision in an ADR',
        'Review project priorities and constraints',
      ];
  }
}

// ─── Escalation Detection ────────────────────────────────────────────

/**
 * Apply ESCALATION_RULES to an EscalationContext.
 * Returns first matching rule, or answerable=true if no rule matches.
 */
export function detectEscalation(ctx: EscalationContext): EscalationDecision {
  for (const rule of ESCALATION_RULES) {
    if (rule.condition(ctx)) {
      return {
        answerable: false,
        category: rule.category,
        reason: `Escalation rule fired: ${rule.category}`,
      };
    }
  }
  return { answerable: true };
}

// ─── buildQueryEscalation ────────────────────────────────────────────

/**
 * Construct an EscalatedIssueRecord when answerable === false.
 *
 * Spec Section 15.13.2 Query-Triggered Escalation → EscalatedIssueRecord Construction.
 */
export function buildQueryEscalation(
  request: Pick<QueryRequest, 'taskId'>,
  decision: EscalationDecision,
  question: string,
): EscalatedIssueRecord {
  const category = decision.category!;
  return {
    issueId: `ESC-${randomUUID().slice(0, 8)}`,
    taskId: request.taskId ?? 'unknown',
    severity: CATEGORY_SEVERITY_MAP[category],
    category,
    summary: `[${category}]: ${question.slice(0, 200)}`,
    description: question,
    reporter: 'query-engine',
    createdAt: new Date().toISOString(),
    escalatedFrom: question,
    answerable: false,
    escalationCategory: category,
    suggestedActions: deriveSuggestedActions(category),
    blockedTaskIds: request.taskId ? [request.taskId] : [],
    status: 'pending',
  };
}
