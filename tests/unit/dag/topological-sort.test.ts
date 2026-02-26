import { describe, it, expect } from 'vitest';
import { topologicalSort, computeCriticalPath } from '../../../src/dag/static/topological-sort.js';
import type { TaskNode, TaskEdge } from '../../../src/dag/types.js';
import type { TaskId } from '../../../src/shared/types.js';

function makeNode(overrides: Partial<TaskNode> & { id: string }): TaskNode {
  return {
    name: overrides.id,
    description: `Description for ${overrides.id}`,
    type: 'planning',
    agent: 'planner',
    dependsOn: [],
    filesRead: [],
    filesWrite: [],
    layer: 0,
    fileConflicts: [],
    ...overrides,
  };
}

function toNodeMap(nodes: TaskNode[]): ReadonlyMap<TaskId, TaskNode> {
  return new Map(nodes.map(n => [n.id, n]));
}

describe('Topological Sort (Kahn\'s Algorithm)', () => {
  it('produces a single layer for independent tasks', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2' }),
      makeNode({ id: 'T3' }),
    ]);
    const edges: TaskEdge[] = [];

    const layers = topologicalSort(nodes, edges);
    expect(layers).toHaveLength(1);
    expect(layers[0].depth).toBe(0);
    expect(layers[0].taskIds).toHaveLength(3);
    expect(layers[0].taskIds).toContain('T1');
    expect(layers[0].taskIds).toContain('T2');
    expect(layers[0].taskIds).toContain('T3');
  });

  it('produces correct layers for a linear chain', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2', dependsOn: ['T1'] }),
      makeNode({ id: 'T3', dependsOn: ['T2'] }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'dependency' },
      { from: 'T2', to: 'T3', type: 'dependency' },
    ];

    const layers = topologicalSort(nodes, edges);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual({ depth: 0, taskIds: ['T1'] });
    expect(layers[1]).toEqual({ depth: 1, taskIds: ['T2'] });
    expect(layers[2]).toEqual({ depth: 2, taskIds: ['T3'] });
  });

  it('produces correct layers for a diamond dependency', () => {
    // T1 -> T2, T1 -> T3, T2 -> T4, T3 -> T4
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2', dependsOn: ['T1'] }),
      makeNode({ id: 'T3', dependsOn: ['T1'] }),
      makeNode({ id: 'T4', dependsOn: ['T2', 'T3'] }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'dependency' },
      { from: 'T1', to: 'T3', type: 'dependency' },
      { from: 'T2', to: 'T4', type: 'dependency' },
      { from: 'T3', to: 'T4', type: 'dependency' },
    ];

    const layers = topologicalSort(nodes, edges);
    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual({ depth: 0, taskIds: ['T1'] });
    // T2 and T3 should be in layer 1 (order doesn't matter)
    expect(layers[1].depth).toBe(1);
    expect(layers[1].taskIds).toHaveLength(2);
    expect(layers[1].taskIds).toContain('T2');
    expect(layers[1].taskIds).toContain('T3');
    expect(layers[2]).toEqual({ depth: 2, taskIds: ['T4'] });
  });

  it('ignores file_conflict edges for layer assignment', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2' }),
    ]);
    // Only a file_conflict edge, no dependency edge
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'file_conflict' },
    ];

    const layers = topologicalSort(nodes, edges);
    // Both should be in layer 0 since file_conflict edges are ignored
    expect(layers).toHaveLength(1);
    expect(layers[0].taskIds).toHaveLength(2);
  });

  it('handles empty graph', () => {
    const nodes = toNodeMap([]);
    const edges: TaskEdge[] = [];

    const layers = topologicalSort(nodes, edges);
    expect(layers).toHaveLength(0);
  });
});

describe('Critical Path Computation', () => {
  it('computes critical path for a linear chain', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2', dependsOn: ['T1'] }),
      makeNode({ id: 'T3', dependsOn: ['T2'] }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'dependency' },
      { from: 'T2', to: 'T3', type: 'dependency' },
    ];

    const path = computeCriticalPath(nodes, edges);
    expect(path).toEqual(['T1', 'T2', 'T3']);
  });

  it('computes critical path for a diamond (longest chain)', () => {
    // T1 -> T2 -> T4, T1 -> T3 -> T4
    // Both paths are length 3, so critical path is any of them
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2', dependsOn: ['T1'] }),
      makeNode({ id: 'T3', dependsOn: ['T1'] }),
      makeNode({ id: 'T4', dependsOn: ['T2', 'T3'] }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'dependency' },
      { from: 'T1', to: 'T3', type: 'dependency' },
      { from: 'T2', to: 'T4', type: 'dependency' },
      { from: 'T3', to: 'T4', type: 'dependency' },
    ];

    const path = computeCriticalPath(nodes, edges);
    // Critical path length should be 3 (T1 -> T2/T3 -> T4)
    expect(path).toHaveLength(3);
    expect(path[0]).toBe('T1');
    expect(path[path.length - 1]).toBe('T4');
  });

  it('returns longest path when branches have different lengths', () => {
    // T1 -> T2 -> T3 -> T5 (length 4)
    // T1 -> T4 -> T5 (length 3)
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2', dependsOn: ['T1'] }),
      makeNode({ id: 'T3', dependsOn: ['T2'] }),
      makeNode({ id: 'T4', dependsOn: ['T1'] }),
      makeNode({ id: 'T5', dependsOn: ['T3', 'T4'] }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'dependency' },
      { from: 'T2', to: 'T3', type: 'dependency' },
      { from: 'T1', to: 'T4', type: 'dependency' },
      { from: 'T3', to: 'T5', type: 'dependency' },
      { from: 'T4', to: 'T5', type: 'dependency' },
    ];

    const path = computeCriticalPath(nodes, edges);
    // Longest chain: T1 -> T2 -> T3 -> T5
    expect(path).toHaveLength(4);
    expect(path).toEqual(['T1', 'T2', 'T3', 'T5']);
  });

  it('handles single node', () => {
    const nodes = toNodeMap([makeNode({ id: 'T1' })]);
    const edges: TaskEdge[] = [];

    const path = computeCriticalPath(nodes, edges);
    expect(path).toEqual(['T1']);
  });

  it('handles empty graph', () => {
    const nodes = toNodeMap([]);
    const edges: TaskEdge[] = [];

    const path = computeCriticalPath(nodes, edges);
    expect(path).toEqual([]);
  });

  it('ignores file_conflict edges in critical path computation', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1' }),
      makeNode({ id: 'T2' }),
    ]);
    const edges: TaskEdge[] = [
      { from: 'T1', to: 'T2', type: 'file_conflict' },
    ];

    const path = computeCriticalPath(nodes, edges);
    // Since there are no dependency edges, each node is independent
    // Critical path is just one node (length 1)
    expect(path).toHaveLength(1);
  });
});
