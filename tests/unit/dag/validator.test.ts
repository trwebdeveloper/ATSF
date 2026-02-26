import { describe, it, expect } from 'vitest';
import { validate } from '../../../src/dag/static/validator.js';
import type { RawTaskDefinition } from '../../../src/dag/types.js';

function makeDef(overrides: Partial<RawTaskDefinition> & { id: string }): RawTaskDefinition {
  return {
    name: overrides.id,
    description: `Description for ${overrides.id}`,
    type: 'planning',
    agent: 'planner',
    dependsOn: [],
    filesRead: [],
    filesWrite: [],
    ...overrides,
  };
}

describe('Validator (DFS 3-Color Cycle Detection)', () => {
  it('passes a valid acyclic graph', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
      makeDef({ id: 'T2', dependsOn: ['T1'] }),
      makeDef({ id: 'T3', dependsOn: ['T1'] }),
      makeDef({ id: 'T4', dependsOn: ['T2', 'T3'] }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects a simple cycle (A -> B -> C -> A)', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'A', dependsOn: ['C'] }),
      makeDef({ id: 'B', dependsOn: ['A'] }),
      makeDef({ id: 'C', dependsOn: ['B'] }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    const cycleError = result.errors.find(e => e.code === 'CYCLE_DETECTED');
    expect(cycleError).toBeDefined();
    expect(cycleError!.cyclePath).toBeDefined();
    expect(cycleError!.cyclePath!.length).toBeGreaterThanOrEqual(2);
  });

  it('detects a self-loop', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', dependsOn: ['T1'] }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(false);
    const selfLoopError = result.errors.find(e => e.code === 'SELF_LOOP');
    expect(selfLoopError).toBeDefined();
    expect(selfLoopError!.taskIds).toContain('T1');
  });

  it('detects missing dependencies', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', dependsOn: ['NONEXISTENT'] }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(false);
    const missingError = result.errors.find(e => e.code === 'MISSING_DEPENDENCY');
    expect(missingError).toBeDefined();
    expect(missingError!.taskIds).toContain('T1');
  });

  it('detects duplicate task IDs', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
      makeDef({ id: 'T1' }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(false);
    const dupError = result.errors.find(e => e.code === 'DUPLICATE_TASK_ID');
    expect(dupError).toBeDefined();
    expect(dupError!.taskIds).toContain('T1');
  });

  it('warns about orphan tasks (no dependencies and nothing depends on them)', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
      makeDef({ id: 'T2', dependsOn: ['T1'] }),
      makeDef({ id: 'T3' }), // orphan: nothing depends on it, it has no deps (except T1 also has no deps, but T2 depends on T1)
    ];

    const result = validate(defs);
    // With T1 having T2 as dependent and T3 being completely disconnected,
    // T3 is an orphan if it's not depended on and doesn't depend on anything
    // But T1 also has no deps... The key is T3 has no inbound and no outbound edges
    // while T1 at least has T2 depending on it
    expect(result.valid).toBe(true); // warnings don't invalidate
    // T3 has no edges at all - it's an orphan
    const orphanWarning = result.warnings.find(
      w => w.code === 'ORPHAN_TASK' && w.taskIds.includes('T3'),
    );
    // Orphan detection: task with zero inbound and zero outbound dependency edges
    // T1 has zero inbound but T2 depends on it (outbound from T1 perspective: T2->T1 means T1 is depended upon)
    // T3 has zero in both directions
    expect(orphanWarning).toBeDefined();
  });

  it('passes a single-node graph with no dependencies', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
    ];

    const result = validate(defs);
    expect(result.valid).toBe(true);
  });

  it('detects a cycle in a larger graph', () => {
    // D -> F -> E -> D forms a cycle
    const defsWithCycle: RawTaskDefinition[] = [
      makeDef({ id: 'A' }),
      makeDef({ id: 'B', dependsOn: ['A'] }),
      makeDef({ id: 'C', dependsOn: ['B'] }),
      makeDef({ id: 'D', dependsOn: ['C', 'F'] }),
      makeDef({ id: 'E', dependsOn: ['D'] }),
      makeDef({ id: 'F', dependsOn: ['E'] }),
    ];

    const result = validate(defsWithCycle);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CYCLE_DETECTED')).toBe(true);
  });
});
