import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../../../src/dag/static/conflict-detector.js';
import type { TaskNode } from '../../../src/dag/types.js';
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

describe('ConflictDetector (micromatch glob overlap)', () => {
  it('detects write-write conflicts on identical paths', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: ['src/auth.ts'] }),
      makeNode({ id: 'T2', filesWrite: ['src/auth.ts'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const ww = conflicts.find(
      c => c.reason === 'write-write' &&
        ((c.taskA === 'T1' && c.taskB === 'T2') || (c.taskA === 'T2' && c.taskB === 'T1')),
    );
    expect(ww).toBeDefined();
  });

  it('detects write-write conflicts on overlapping globs', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: ['src/**/*.ts'] }),
      makeNode({ id: 'T2', filesWrite: ['src/auth/*.ts'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts.some(c => c.reason === 'write-write')).toBe(true);
  });

  it('detects read-write conflicts', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: ['src/config.ts'] }),
      makeNode({ id: 'T2', filesRead: ['src/config.ts'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts.some(c => c.reason === 'read-write')).toBe(true);
  });

  it('allows multiple concurrent reads (no conflict)', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesRead: ['src/config.ts'] }),
      makeNode({ id: 'T2', filesRead: ['src/config.ts'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty array when no file overlaps exist', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: ['src/a.ts'] }),
      makeNode({ id: 'T2', filesWrite: ['src/b.ts'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts).toHaveLength(0);
  });

  it('detects conflicts with glob patterns using micromatch', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: ['src/**/*.ts'] }),
      makeNode({ id: 'T2', filesWrite: ['src/utils/*.ts'] }),
      makeNode({ id: 'T3', filesRead: ['docs/**/*.md'] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    // T1 and T2 should have write-write conflict
    expect(conflicts.some(c =>
      c.reason === 'write-write' &&
      ((c.taskA === 'T1' && c.taskB === 'T2') || (c.taskA === 'T2' && c.taskB === 'T1')),
    )).toBe(true);
    // T3 should not conflict with T1 or T2 (different paths)
    expect(conflicts.some(c =>
      c.taskA === 'T3' || c.taskB === 'T3',
    )).toBe(false);
  });

  it('handles empty filesWrite and filesRead', () => {
    const nodes = toNodeMap([
      makeNode({ id: 'T1', filesWrite: [], filesRead: [] }),
      makeNode({ id: 'T2', filesWrite: [], filesRead: [] }),
    ]);

    const conflicts = detectConflicts(nodes, '/workspace');
    expect(conflicts).toHaveLength(0);
  });
});
