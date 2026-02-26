import type { TaskId } from '../../shared/types.js';
import type { TaskNode, TaskEdge, TopologicalLayer } from '../types.js';

/**
 * THE ONLY implementation of Kahn's algorithm in ATSF.
 * Returns tasks grouped into topological layers (tasks at the same depth
 * that can run concurrently, subject to file conflict constraints).
 *
 * Only considers 'dependency' edges for layer assignment.
 * File conflict edges are handled at runtime by FileLockManager.
 *
 * @param nodes - Map of task nodes
 * @param edges - All edges (dependency and file_conflict)
 * @returns Topological layers ordered by depth
 */
export function topologicalSort(
  nodes: ReadonlyMap<TaskId, TaskNode>,
  edges: readonly TaskEdge[],
): readonly TopologicalLayer[] {
  if (nodes.size === 0) {
    return [];
  }

  // Compute in-degree for each node, counting only dependency edges
  const inDegree = new Map<TaskId, number>();
  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
  }

  // Build adjacency list for dependency edges only
  const successors = new Map<TaskId, TaskId[]>();
  for (const id of nodes.keys()) {
    successors.set(id, []);
  }

  for (const edge of edges) {
    if (edge.type === 'dependency') {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      const succs = successors.get(edge.from);
      if (succs) {
        succs.push(edge.to);
      }
    }
  }

  // Initialize with all nodes that have in-degree 0
  let currentLayer: TaskId[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentLayer.push(id);
    }
  }

  const layers: TopologicalLayer[] = [];
  let depth = 0;

  while (currentLayer.length > 0) {
    layers.push({ depth, taskIds: [...currentLayer] });
    const nextLayer: TaskId[] = [];

    for (const nodeId of currentLayer) {
      const succs = successors.get(nodeId) ?? [];
      for (const succId of succs) {
        const newDeg = (inDegree.get(succId) ?? 1) - 1;
        inDegree.set(succId, newDeg);
        if (newDeg === 0) {
          nextLayer.push(succId);
        }
      }
    }

    currentLayer = nextLayer;
    depth += 1;
  }

  return layers;
}

/**
 * Compute the critical path (longest dependency chain) in the DAG.
 *
 * Algorithm:
 * 1. Identify all sink nodes (no outgoing dependency edges).
 * 2. For each node, compute dist[node] = max(dist[successor] + 1).
 *    Sink nodes have dist = 0.
 * 3. The node with max dist is the start of the critical path.
 * 4. Reconstruct the path following the successor with highest dist.
 *
 * Only considers 'dependency' edges.
 *
 * @param nodes - Map of task nodes
 * @param edges - All edges (dependency and file_conflict)
 * @returns Array of TaskIds representing the critical path, ordered first to last
 */
export function computeCriticalPath(
  nodes: ReadonlyMap<TaskId, TaskNode>,
  edges: readonly TaskEdge[],
): readonly TaskId[] {
  if (nodes.size === 0) {
    return [];
  }

  // Build adjacency lists for dependency edges only
  const successors = new Map<TaskId, TaskId[]>();
  const predecessors = new Map<TaskId, TaskId[]>();

  for (const id of nodes.keys()) {
    successors.set(id, []);
    predecessors.set(id, []);
  }

  for (const edge of edges) {
    if (edge.type === 'dependency') {
      successors.get(edge.from)?.push(edge.to);
      predecessors.get(edge.to)?.push(edge.from);
    }
  }

  // Compute dist[node] using dynamic programming on topological order
  // dist[node] = longest path starting from node to any sink
  const dist = new Map<TaskId, number>();

  // Process in reverse topological order (sinks first)
  // Use Kahn's from sinks (nodes with no outgoing dependency edges)
  const outDegree = new Map<TaskId, number>();
  for (const [id, succs] of successors.entries()) {
    outDegree.set(id, succs.length);
  }

  // Find sinks
  let currentLevel: TaskId[] = [];
  for (const [id, deg] of outDegree.entries()) {
    if (deg === 0) {
      currentLevel.push(id);
      dist.set(id, 0);
    }
  }

  // Process in reverse topological order
  const visited = new Set<TaskId>();
  while (currentLevel.length > 0) {
    const nextLevel: TaskId[] = [];
    for (const nodeId of currentLevel) {
      visited.add(nodeId);
      const preds = predecessors.get(nodeId) ?? [];
      for (const predId of preds) {
        // Update dist for predecessor
        const newDist = (dist.get(nodeId) ?? 0) + 1;
        const currentDist = dist.get(predId) ?? 0;
        if (newDist > currentDist) {
          dist.set(predId, newDist);
        }
        // Check if all successors of predId have been processed
        const predOutDeg = (outDegree.get(predId) ?? 1) - 1;
        outDegree.set(predId, predOutDeg);
        if (predOutDeg === 0) {
          nextLevel.push(predId);
        }
      }
    }
    currentLevel = nextLevel;
  }

  // Find the node with maximum dist (start of critical path)
  let maxDist = -1;
  let startNode: TaskId | null = null;
  for (const [id, d] of dist.entries()) {
    if (d > maxDist) {
      maxDist = d;
      startNode = id;
    }
  }

  if (startNode === null) {
    return [];
  }

  // Reconstruct path from startNode following successor with highest dist
  const path: TaskId[] = [startNode];
  let current = startNode;

  let succs = successors.get(current) ?? [];
  while (succs.length > 0) {

    // Pick successor with highest dist (greedy: it's on the critical path)
    let bestSucc: TaskId | null = null;
    let bestDist = -1;
    for (const succId of succs) {
      const d = dist.get(succId) ?? 0;
      if (d > bestDist) {
        bestDist = d;
        bestSucc = succId;
      }
    }

    if (bestSucc === null) break;
    path.push(bestSucc);
    current = bestSucc;
    succs = successors.get(current) ?? [];
  }

  return path;
}
