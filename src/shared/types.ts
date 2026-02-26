/**
 * Branded type utility for nominal typing.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Semantic type alias for task identifiers throughout ATSF.
 */
export type TaskId = string;

/**
 * Semantic type alias for agent identifiers.
 */
export type AgentId = string;

/**
 * Token usage statistics from a provider call.
 */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/**
 * Snapshot of the current execution state.
 */
export interface ExecutionSnapshot {
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly pendingTasks: number;
  readonly runningTasks: number;
  readonly skippedTasks: number;
  readonly totalCostUsd: number;
  readonly elapsedMs: number;
}
