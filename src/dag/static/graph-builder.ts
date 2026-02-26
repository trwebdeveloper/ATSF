import type { TaskId } from '../../shared/types.js';
import { ATSFError } from '../../shared/errors.js';
import { normalizePath } from '../../shared/normalize-path.js';
import type {
  RawTaskDefinition,
  TaskNode,
  TaskEdge,
  TaskGraph,
  FileConflict,
  TopologicalLayer,
} from '../types.js';
import { validate } from './validator.js';
import { detectConflicts } from './conflict-detector.js';
import { topologicalSort, computeCriticalPath } from './topological-sort.js';

/**
 * Error thrown when graph construction fails validation.
 */
export class GraphBuildError extends ATSFError {
  constructor(message: string, cause?: Error) {
    super(message, 'GRAPH_BUILD_ERROR', cause);
    this.name = 'GraphBuildError';
  }
}

/**
 * Constructs, validates, detects conflicts, sorts, and returns a TaskGraph
 * from raw task definitions.
 *
 * Pipeline:
 * 1. Normalize file paths in RawTaskDefinition.filesRead/filesWrite
 * 2. Validate (DFS 3-color cycle detection, missing deps, self-loops, duplicates)
 * 3. Build dependency edges
 * 4. Run Kahn's topological sort to assign layers
 * 5. Detect file conflicts via micromatch
 * 6. Build file_conflict edges
 * 7. Compute critical path
 * 8. Assemble and return immutable TaskGraph
 */
export class GraphBuilder {
  /**
   * Construct, validate, detect conflicts, sort, and return a TaskGraph.
   * Throws if validation fails (cycles, missing deps, etc.).
   *
   * @param tasks - Raw task definitions to build the graph from
   * @returns A validated, immutable TaskGraph
   */
  build(tasks: readonly RawTaskDefinition[]): TaskGraph {
    // Step 1: Normalize file paths at input boundary
    const normalizedTasks = tasks.map(task => ({
      ...task,
      filesRead: task.filesRead.map(normalizePath),
      filesWrite: task.filesWrite.map(normalizePath),
    }));

    // Step 2: Validate
    const validationResult = validate(normalizedTasks);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        .map(e => `${e.code}: ${e.message}`)
        .join('; ');
      throw new GraphBuildError(`Graph validation failed: ${errorMessages}`);
    }

    // Step 3: Build dependency edges
    const dependencyEdges: TaskEdge[] = [];
    for (const task of normalizedTasks) {
      for (const depId of task.dependsOn) {
        dependencyEdges.push({
          from: depId,
          to: task.id,
          type: 'dependency',
        });
      }
    }

    // Step 4: Create initial TaskNode map (with placeholder layer and fileConflicts)
    const initialNodes = new Map<TaskId, TaskNode>();
    for (const task of normalizedTasks) {
      initialNodes.set(task.id, {
        ...task,
        layer: 0,
        fileConflicts: [],
      });
    }

    // Step 5: Run Kahn's topological sort to assign layers
    const layers: readonly TopologicalLayer[] = topologicalSort(initialNodes, dependencyEdges);

    // Build layer lookup
    const layerMap = new Map<TaskId, number>();
    for (const layer of layers) {
      for (const taskId of layer.taskIds) {
        layerMap.set(taskId, layer.depth);
      }
    }

    // Update nodes with layer assignments
    const layeredNodes = new Map<TaskId, TaskNode>();
    for (const [id, node] of initialNodes) {
      layeredNodes.set(id, {
        ...node,
        layer: layerMap.get(id) ?? 0,
      });
    }

    // Step 6: Detect file conflicts via micromatch
    const fileConflicts: readonly FileConflict[] = detectConflicts(layeredNodes, '.');

    // Step 7: Build file_conflict edges and per-node conflict lists
    const conflictEdges: TaskEdge[] = [];
    const nodeConflictMap = new Map<TaskId, Set<TaskId>>();

    for (const conflict of fileConflicts) {
      conflictEdges.push({
        from: conflict.taskA,
        to: conflict.taskB,
        type: 'file_conflict',
      });

      // Track per-node conflicts
      if (!nodeConflictMap.has(conflict.taskA)) {
        nodeConflictMap.set(conflict.taskA, new Set());
      }
      if (!nodeConflictMap.has(conflict.taskB)) {
        nodeConflictMap.set(conflict.taskB, new Set());
      }
      nodeConflictMap.get(conflict.taskA)!.add(conflict.taskB);
      nodeConflictMap.get(conflict.taskB)!.add(conflict.taskA);
    }

    // Update nodes with fileConflicts
    const finalNodes = new Map<TaskId, TaskNode>();
    for (const [id, node] of layeredNodes) {
      const conflictingIds = nodeConflictMap.get(id);
      finalNodes.set(id, {
        ...node,
        fileConflicts: conflictingIds ? [...conflictingIds] : [],
      });
    }

    // Step 8: Combine all edges
    const allEdges: readonly TaskEdge[] = [...dependencyEdges, ...conflictEdges];

    // Step 9: Compute critical path
    const criticalPath = computeCriticalPath(finalNodes, allEdges);

    // Step 10: Assemble and return immutable TaskGraph
    return {
      nodes: finalNodes,
      edges: allEdges,
      layers,
      fileConflicts,
      criticalPath,
    };
  }
}
