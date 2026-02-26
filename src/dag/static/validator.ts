import type { TaskId } from '../../shared/types.js';
import type {
  RawTaskDefinition,
  ValidationResult,
  GraphValidationError,
  GraphValidationWarning,
} from '../types.js';

/**
 * DFS 3-color cycle detection.
 * Colors: WHITE (unvisited), GRAY (in progress), BLACK (complete).
 * When a GRAY node is encountered during DFS, a cycle is detected.
 */
const enum Color {
  WHITE = 0,
  GRAY = 1,
  BLACK = 2,
}

/**
 * Validate a set of raw task definitions for structural correctness.
 * Uses DFS 3-color marking for cycle detection, providing human-readable
 * error paths showing exactly which tasks form the cycle.
 *
 * @param definitions - The raw task definitions to validate
 * @returns A ValidationResult with errors and warnings
 */
export function validate(definitions: readonly RawTaskDefinition[]): ValidationResult {
  const errors: GraphValidationError[] = [];
  const warnings: GraphValidationWarning[] = [];

  // Build lookup map
  const taskMap = new Map<TaskId, RawTaskDefinition>();
  const seenIds = new Set<TaskId>();

  // Check for duplicate IDs
  for (const def of definitions) {
    if (seenIds.has(def.id)) {
      errors.push({
        code: 'DUPLICATE_TASK_ID',
        message: `Duplicate task ID: "${def.id}"`,
        taskIds: [def.id],
      });
    } else {
      seenIds.add(def.id);
      taskMap.set(def.id, def);
    }
  }

  // Check for self-loops and missing dependencies
  for (const def of definitions) {
    for (const depId of def.dependsOn) {
      if (depId === def.id) {
        errors.push({
          code: 'SELF_LOOP',
          message: `Task "${def.id}" depends on itself`,
          taskIds: [def.id],
        });
      } else if (!taskMap.has(depId)) {
        errors.push({
          code: 'MISSING_DEPENDENCY',
          message: `Task "${def.id}" depends on non-existent task "${depId}"`,
          taskIds: [def.id],
        });
      }
    }
  }

  // If we already have errors (duplicate IDs, missing deps, self-loops),
  // cycle detection may not work correctly, so return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Build adjacency list (from -> [to]) where "from" depends on "to" means edge from -> to
  // Actually in DAG terms: if B dependsOn A, there's an edge A -> B (A must come before B)
  // For DFS cycle detection, we follow the dependency direction:
  // If B depends on A, we have edge B -> A in the "depends on" graph
  // OR equivalently edge A -> B in the "must precede" graph
  // For cycle detection, we use the adjacency in dependency direction: A -> B means A must finish before B
  const adjacency = new Map<TaskId, TaskId[]>();
  for (const def of definitions) {
    if (!adjacency.has(def.id)) {
      adjacency.set(def.id, []);
    }
  }
  // Edge direction: if B depends on A, then A -> B (A is a predecessor of B)
  for (const def of definitions) {
    for (const depId of def.dependsOn) {
      const successors = adjacency.get(depId);
      if (successors) {
        successors.push(def.id);
      }
    }
  }

  // DFS 3-color cycle detection
  const color = new Map<TaskId, Color>();
  for (const id of taskMap.keys()) {
    color.set(id, Color.WHITE);
  }

  const parent = new Map<TaskId, TaskId | null>();

  function dfs(nodeId: TaskId): boolean {
    color.set(nodeId, Color.GRAY);
    const successors = adjacency.get(nodeId) ?? [];

    for (const succId of successors) {
      const succColor = color.get(succId);
      if (succColor === Color.GRAY) {
        // Cycle detected! Reconstruct the cycle path
        const cyclePath: TaskId[] = [succId, nodeId];
        let current = nodeId;
        while (current !== succId && parent.has(current)) {
          const p = parent.get(current);
          if (p === null || p === undefined) break;
          cyclePath.push(p);
          current = p;
        }
        cyclePath.reverse();

        errors.push({
          code: 'CYCLE_DETECTED',
          message: `Cycle detected: ${cyclePath.join(' -> ')}`,
          taskIds: cyclePath,
          cyclePath,
        });
        return true;
      }
      if (succColor === Color.WHITE) {
        parent.set(succId, nodeId);
        if (dfs(succId)) {
          return true;
        }
      }
    }

    color.set(nodeId, Color.BLACK);
    return false;
  }

  for (const id of taskMap.keys()) {
    if (color.get(id) === Color.WHITE) {
      parent.set(id, null);
      dfs(id);
    }
  }

  // Check for orphan tasks: tasks with no inbound and no outbound dependency edges
  // Only warn if there are multiple tasks (a single task is fine)
  if (definitions.length > 1) {
    const hasInbound = new Set<TaskId>();
    const hasOutbound = new Set<TaskId>();

    for (const def of definitions) {
      for (const depId of def.dependsOn) {
        hasOutbound.add(def.id);   // def has outbound (it depends on something)
        hasInbound.add(depId);     // depId has inbound (something depends on it)
      }
    }

    for (const def of definitions) {
      if (!hasInbound.has(def.id) && !hasOutbound.has(def.id)) {
        warnings.push({
          code: 'ORPHAN_TASK',
          message: `Task "${def.id}" has no dependencies and nothing depends on it`,
          taskIds: [def.id],
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
