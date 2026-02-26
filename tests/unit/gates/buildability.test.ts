import { describe, it, expect } from 'vitest';
import { buildabilityGate } from '../../../src/gates/buildability.js';
import { createGateContext, createMinimalArtifactSet } from './helpers.js';

describe('Buildability Gate', () => {
  it('has correct metadata', () => {
    expect(buildabilityGate.id).toBe('buildability');
    expect(buildabilityGate.name).toBe('Buildability Gate');
    expect(buildabilityGate.priority).toBe(1);
    expect(buildabilityGate.fixable).toBe(true);
  });

  it('produces GateResult with findings', async () => {
    const context = createGateContext();
    const result = await buildabilityGate.run(context);

    expect(result.gateId).toBe('buildability');
    expect(typeof result.score).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('scores 1.0 for a valid DAG', async () => {
    const context = createGateContext();
    const result = await buildabilityGate.run(context);

    // The minimal artifact set has TASK-001 -> TASK-002, which is a valid DAG
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.findings.filter(f => f.severity === 'error')).toHaveLength(0);
  });

  it('detects cycles in task dependencies', async () => {
    const artifacts = createMinimalArtifactSet();
    // Create a cycle: TASK-001 -> TASK-002 -> TASK-001
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      dependsOn: ['TASK-002'],
    };

    const context = createGateContext({ artifacts });
    const result = await buildabilityGate.run(context);

    expect(result.score).toBe(0.0);
    expect(result.passed).toBe(false);
    const cycleFindings = result.findings.filter(f => f.ruleId === 'buildability-cycle');
    expect(cycleFindings.length).toBeGreaterThan(0);
  });

  it('generates fixes for cycles', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      dependsOn: ['TASK-002'],
    };

    const context = createGateContext({ artifacts });
    const result = await buildabilityGate.run(context);

    const cycleFixes = result.fixes.filter(f => f.ruleId === 'buildability-cycle');
    expect(cycleFixes.length).toBeGreaterThan(0);
    expect(cycleFixes[0].fix.type).toBe('delete');
  });

  it('detects file lock conflicts', async () => {
    const artifacts = createMinimalArtifactSet();
    // Both tasks write to the same file without ordering
    artifacts.taskGraph.tasks = [
      {
        id: 'TASK-001',
        name: 'Task A',
        description: 'Write to shared file from task A with full implementation',
        agent: 'builder',
        type: 'feature',
        dependsOn: [],
        filesWrite: ['src/shared.ts'],
        filesRead: [],
        priority: 3,
        acceptanceCriteria: [{ description: 'Task A completes successfully and writes output', testable: true }],
        tags: [],
      },
      {
        id: 'TASK-002',
        name: 'Task B',
        description: 'Write to shared file from task B with different implementation',
        agent: 'builder',
        type: 'feature',
        dependsOn: [],  // No dependency on TASK-001!
        filesWrite: ['src/shared.ts'],
        filesRead: [],
        priority: 2,
        acceptanceCriteria: [{ description: 'Task B completes successfully and writes output', testable: true }],
        tags: [],
      },
    ];

    const context = createGateContext({ artifacts });
    const result = await buildabilityGate.run(context);

    const conflictFindings = result.findings.filter(f => f.ruleId === 'buildability-file-conflict');
    expect(conflictFindings.length).toBeGreaterThan(0);
    expect(conflictFindings[0].message).toContain('shared.ts');
  });

  it('no file lock conflict when tasks are ordered', async () => {
    const artifacts = createMinimalArtifactSet();
    // TASK-002 depends on TASK-001, so their writes to the same file are ordered
    artifacts.taskGraph.tasks = [
      {
        id: 'TASK-001',
        name: 'Task A',
        description: 'Write to shared file from task A first with initial implementation',
        agent: 'builder',
        type: 'feature',
        dependsOn: [],
        filesWrite: ['src/shared.ts'],
        filesRead: [],
        priority: 3,
        acceptanceCriteria: [{ description: 'Task A creates the initial shared file correctly', testable: true }],
        tags: [],
      },
      {
        id: 'TASK-002',
        name: 'Task B',
        description: 'Write to shared file from task B after A is complete',
        agent: 'builder',
        type: 'feature',
        dependsOn: ['TASK-001'],
        filesWrite: ['src/shared.ts'],
        filesRead: [],
        priority: 2,
        acceptanceCriteria: [{ description: 'Task B updates the shared file correctly', testable: true }],
        tags: [],
      },
    ];

    const context = createGateContext({ artifacts });
    const result = await buildabilityGate.run(context);

    const conflictFindings = result.findings.filter(f => f.ruleId === 'buildability-file-conflict');
    expect(conflictFindings).toHaveLength(0);
  });

  it('binary score: 0.0 if any structural error', async () => {
    const artifacts = createMinimalArtifactSet();
    // Self-dependency cycle
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      dependsOn: ['TASK-001'],
    };

    const context = createGateContext({ artifacts });
    const result = await buildabilityGate.run(context);

    expect(result.score).toBe(0.0);
  });

  it('returns early on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createGateContext({ signal: controller.signal });
    const result = await buildabilityGate.run(context);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});
