import type { EventBus } from '../events/types.js';
import type { ExecutionSnapshot } from '../shared/types.js';

/**
 * Top-level coordinator. Wires together all subsystems and drives the
 * full pipeline from input to artifacts.
 * Interface only — implementation in T14.
 */
export interface OrchestratorEngine {
  run(config: OrchestratorConfig): Promise<OrchestratorResult>;
  readonly eventBus: EventBus;
}

export interface OrchestratorConfig {
  readonly inputPath: string;
  readonly workspaceRoot: string;
  readonly providers: readonly string[];
  readonly maxConcurrency?: number;
  readonly interactive?: boolean;
  readonly signal?: AbortSignal;
}

export interface OrchestratorResult {
  readonly success: boolean;
  readonly artifacts: readonly string[];
  readonly executionSnapshot: ExecutionSnapshot;
  readonly totalCostUsd: number;
  readonly durationMs: number;
}
