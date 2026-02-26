import type { TaskId } from '../shared/types.js';

/**
 * Raw task definition as parsed from YAML input.
 * This is the input to GraphBuilder.build().
 */
export interface RawTaskDefinition {
  readonly id: TaskId;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly agent: string;
  readonly dependsOn: readonly TaskId[];
  readonly filesRead: readonly string[];
  readonly filesWrite: readonly string[];
  readonly priority?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A validated task node within the DAG.
 * Extends RawTaskDefinition with computed properties from GraphBuilder.
 * Used by the runtime scheduler and all static analysis functions.
 */
export interface TaskNode extends RawTaskDefinition {
  readonly layer: number;
  readonly fileConflicts: readonly TaskId[];
}

/**
 * A directed edge in the task DAG.
 * 'dependency' edges encode task ordering (dependsOn).
 * 'file_conflict' edges encode file-level mutual exclusion constraints
 * detected by the ConflictDetector.
 */
export interface TaskEdge {
  readonly from: TaskId;
  readonly to: TaskId;
  readonly type: 'dependency' | 'file_conflict';
}

/**
 * A topological layer containing tasks that can run concurrently.
 */
export interface TopologicalLayer {
  readonly depth: number;
  readonly taskIds: readonly TaskId[];
}

/**
 * A file conflict between two tasks.
 */
export interface FileConflict {
  readonly taskA: TaskId;
  readonly taskB: TaskId;
  readonly pattern: string;
  readonly reason: 'write-write' | 'read-write';
}

/**
 * Validation error from the DFS validator.
 */
export interface GraphValidationError {
  readonly code: 'CYCLE_DETECTED' | 'MISSING_DEPENDENCY' | 'SELF_LOOP' | 'DUPLICATE_TASK_ID';
  readonly message: string;
  readonly taskIds: readonly TaskId[];
  readonly cyclePath?: readonly TaskId[];
}

/**
 * Validation warning from the DFS validator.
 */
export interface GraphValidationWarning {
  readonly code: 'ORPHAN_TASK' | 'DEEP_DEPENDENCY_CHAIN' | 'WIDE_WRITE_GLOB';
  readonly message: string;
  readonly taskIds: readonly TaskId[];
}

/**
 * Result of graph validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly GraphValidationError[];
  readonly warnings: readonly GraphValidationWarning[];
}

/**
 * The validated, immutable output of the static layer.
 * The runtime layer consumes this and never modifies graph structure.
 */
export interface TaskGraph {
  readonly nodes: ReadonlyMap<TaskId, TaskNode>;
  readonly edges: readonly TaskEdge[];
  readonly layers: readonly TopologicalLayer[];
  readonly fileConflicts: readonly FileConflict[];
  readonly criticalPath: readonly TaskId[];
}
