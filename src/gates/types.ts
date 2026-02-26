/**
 * Quality Gate Types — T12
 *
 * Core interfaces for the quality gate system per Section 7.6.
 * GatePlugin, GateContext, GateResult, GateFinding, GateFix, GateReport,
 * GateConfigEntry, GateConfigSchema, ResolvedGateConfig.
 */

import { z } from 'zod';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import type { ProviderAdapter } from '../providers/types.js';
import type { Semaphore } from '../resilience/semaphore.js';
import type { ArtifactSet, CrossRefValidationResult } from '../emitter/cross-ref-validator.js';

/* ------------------------------------------------------------------ */
/*  Logger interface (minimal for gate context)                        */
/* ------------------------------------------------------------------ */

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

/* ------------------------------------------------------------------ */
/*  Gate Configuration Schema (Section 7.8)                            */
/* ------------------------------------------------------------------ */

/** Per-gate configuration. */
export const GateConfigEntry = z.object({
  /** Whether this gate is enabled. Default: true. */
  enabled: z.boolean().default(true),
  /** Per-gate pass threshold (0.0-1.0). Overrides global threshold. */
  threshold: z.number().min(0).max(1).optional(),
  /** Whether auto-fix is enabled for this gate. Overrides global autoFix. */
  autoFix: z.boolean().optional(),
  /** Custom rules for this gate (gate-specific). */
  rules: z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
    severity: z.enum(['error', 'warning', 'info']).optional(),
  })).optional(),
});

/** Complete gate configuration schema. */
export const GateConfigSchema = z.object({
  /** Global pass threshold. All gates must meet this unless overridden. */
  threshold: z.number().min(0).max(1).default(0.8),
  /** Global auto-fix toggle. */
  autoFix: z.boolean().default(true),
  /** Maximum auto-fix rounds before giving up. */
  maxFixRounds: z.number().int().min(0).max(10).default(3),
  /** Reporter format for gate output. */
  reporter: z.enum(['console', 'json', 'markdown', 'junit']).default('console'),
  /** Per-gate overrides keyed by gate ID. */
  gates: z.record(z.string(), GateConfigEntry).default({}),
  /** Custom gate plugins (loaded via config file). */
  custom: z.array(z.any()).default([]),
});

export type GateConfig = z.infer<typeof GateConfigSchema>;

/** Resolved configuration with per-gate defaults merged. */
export interface ResolvedGateConfig extends GateConfig {
  /** Resolved per-gate config with global defaults applied. */
  gates: Record<string, Required<z.infer<typeof GateConfigEntry>>>;
}

/* ------------------------------------------------------------------ */
/*  GateFinding (Section 7.6)                                          */
/* ------------------------------------------------------------------ */

/** A single finding produced by a gate. */
export interface GateFinding {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: {
    readonly artifact: 'task_graph' | 'repo_blueprint' | 'mpd' | 'tickets' | 'ai_prompt_pack';
    readonly file: string;
    readonly path: string[];
  };
  /** Whether an auto-fix is available for this finding. */
  readonly fixable: boolean;
}

/* ------------------------------------------------------------------ */
/*  GateFix (Section 7.4)                                              */
/* ------------------------------------------------------------------ */

/** A declarative fix proposed by a gate. ESLint-inspired model. */
export interface GateFix {
  readonly gateId: string;
  readonly ruleId: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly description: string;
  readonly location: {
    readonly file: string;
    readonly path: string[];
  };
  readonly fix: {
    readonly type: 'replace' | 'insert' | 'delete';
    readonly target: string;
    readonly value: unknown;
  };
}

/* ------------------------------------------------------------------ */
/*  GateResult (Section 7.6)                                           */
/* ------------------------------------------------------------------ */

/** Result returned by a gate plugin after execution. */
export interface GateResult {
  readonly gateId: string;
  /** Score from 0.0 (complete failure) to 1.0 (perfect pass). */
  readonly score: number;
  /** Whether the gate passed its configured threshold. */
  readonly passed: boolean;
  /** Individual findings (violations, warnings, info). */
  readonly findings: readonly GateFinding[];
  /** Proposed fixes (only populated if gate is fixable). */
  readonly fixes: readonly GateFix[];
  /** Duration of this gate's execution in milliseconds. */
  readonly durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  GateContext (Section 7.6)                                           */
/* ------------------------------------------------------------------ */

/** Context provided to each gate plugin at execution time. */
export interface GateContext {
  /** The complete set of validated artifacts. */
  readonly artifacts: ArtifactSet;
  /** Gate-specific and global configuration. */
  readonly config: ResolvedGateConfig;
  /** Structured logger. */
  readonly logger: Logger;
  /** Cross-reference validator for L3 validation queries. */
  readonly validateCrossReferences: (artifacts: ArtifactSet) => CrossRefValidationResult;
  /** Abort signal for cancellation support. */
  readonly signal: AbortSignal;
  /** Resilience layer for LLM calls within gates. */
  readonly resilience: ResilienceLayer;
  /** Provider adapter for LLM-powered auto-fix. */
  readonly provider: ProviderAdapter;
  /** Model identifier for LLM-powered auto-fix. */
  readonly model: string;
  /** Shared semaphore limiting total concurrent LLM calls across all parallel gates. */
  readonly llmSemaphore: Semaphore;
}

/* ------------------------------------------------------------------ */
/*  GatePlugin (Section 7.6)                                           */
/* ------------------------------------------------------------------ */

/** A single quality gate plugin. */
export interface GatePlugin {
  /** Unique gate identifier (e.g., 'coverage', 'security'). */
  readonly id: string;
  /** Human-readable gate name. */
  readonly name: string;
  /** SemVer version of this gate plugin. */
  readonly version: string;
  /** Gate priority for fix conflict resolution (lower = higher priority). */
  readonly priority: number;
  /** Whether this gate supports auto-fix. */
  readonly fixable: boolean;
  /** Execute the gate check against the provided context. */
  run(context: GateContext): Promise<GateResult>;
}

/* ------------------------------------------------------------------ */
/*  GateReport (Section 7.5)                                           */
/* ------------------------------------------------------------------ */

export interface GateReport {
  readonly timestamp: Date;
  readonly duration: number;
  readonly gates: readonly GateResult[];
  readonly overallScore: number;
  readonly passed: boolean;
  readonly fixesApplied: number;
  readonly fixRoundsUsed: number;
}

/* ------------------------------------------------------------------ */
/*  Reporter interface                                                  */
/* ------------------------------------------------------------------ */

export interface GateReporter {
  readonly format: string;
  render(report: GateReport): string;
}
