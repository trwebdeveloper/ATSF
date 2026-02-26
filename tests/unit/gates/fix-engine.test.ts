import { describe, it, expect } from 'vitest';
import { resolveConflicts, applyFixes, runFixEngine } from '../../../src/gates/fix-engine.js';
import type { GateFix, GatePlugin, GateResult } from '../../../src/gates/types.js';
import { createGateContext } from './helpers.js';

function createFix(overrides: Partial<GateFix>): GateFix {
  return {
    gateId: 'test',
    ruleId: 'test-rule',
    severity: 'error',
    description: 'Test fix',
    location: {
      file: 'test.yaml',
      path: ['test'],
    },
    fix: {
      type: 'replace',
      target: 'test',
      value: 'fixed',
    },
    ...overrides,
  };
}

describe('resolveConflicts', () => {
  it('keeps all fixes when no conflicts exist', () => {
    const fixes = [
      createFix({ gateId: 'security', location: { file: 'a.yaml', path: ['a'] } }),
      createFix({ gateId: 'coverage', location: { file: 'b.yaml', path: ['b'] } }),
    ];

    const resolved = resolveConflicts(fixes);
    expect(resolved).toHaveLength(2);
  });

  it('higher-priority gate wins on conflict (security > coverage)', () => {
    const fixes = [
      createFix({
        gateId: 'coverage',
        location: { file: 'task_graph.yaml', path: ['tasks'] },
        fix: { type: 'insert', target: 'tasks', value: 'coverage-fix' },
      }),
      createFix({
        gateId: 'security',
        location: { file: 'task_graph.yaml', path: ['tasks'] },
        fix: { type: 'replace', target: 'tasks', value: 'security-fix' },
      }),
    ];

    const resolved = resolveConflicts(fixes);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].gateId).toBe('security');
  });

  it('respects full priority order: security > buildability > consistency > coverage > testability', () => {
    const fixes = [
      createFix({ gateId: 'testability', location: { file: 'x.yaml', path: ['a'] } }),
      createFix({ gateId: 'security', location: { file: 'x.yaml', path: ['a'] } }),
      createFix({ gateId: 'coverage', location: { file: 'x.yaml', path: ['a'] } }),
      createFix({ gateId: 'buildability', location: { file: 'x.yaml', path: ['a'] } }),
      createFix({ gateId: 'consistency', location: { file: 'x.yaml', path: ['a'] } }),
    ];

    const resolved = resolveConflicts(fixes);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].gateId).toBe('security');
  });

  it('handles empty fix list', () => {
    expect(resolveConflicts([])).toHaveLength(0);
  });
});

describe('applyFixes', () => {
  it('returns the number of fixes applied', () => {
    const fixes = [
      createFix({ gateId: 'a' }),
      createFix({ gateId: 'b' }),
    ];
    expect(applyFixes(fixes)).toBe(2);
  });

  it('returns 0 for empty list', () => {
    expect(applyFixes([])).toBe(0);
  });
});

describe('runFixEngine', () => {
  it('runs max 3 rounds by default', async () => {
    const mockGate: GatePlugin = {
      id: 'mock',
      name: 'Mock',
      version: '1.0.0',
      priority: 0,
      fixable: true,
      async run(): Promise<GateResult> {
        return {
          gateId: 'mock',
          score: 0.5,
          passed: false,
          findings: [],
          fixes: [createFix({ gateId: 'mock' })],
          durationMs: 0,
        };
      },
    };

    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [createFix({ gateId: 'mock' })],
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [mockGate],
      context,
      initialResults,
      { maxFixRounds: 3, autoFix: true },
    );

    expect(result.fixRoundsUsed).toBeLessThanOrEqual(3);
    expect(result.fixesApplied).toBeGreaterThan(0);
  });

  it('stops early when all gates pass', async () => {
    const mockGate: GatePlugin = {
      id: 'mock',
      name: 'Mock',
      version: '1.0.0',
      priority: 0,
      fixable: true,
      async run(): Promise<GateResult> {
        return {
          gateId: 'mock',
          score: 1.0,
          passed: true,
          findings: [],
          fixes: [],
          durationMs: 0,
        };
      },
    };

    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [createFix({ gateId: 'mock' })],
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [mockGate],
      context,
      initialResults,
      { maxFixRounds: 10, autoFix: true },
    );

    // After first round, gate passes, so should stop
    expect(result.fixRoundsUsed).toBe(1);
    expect(result.finalResults[0].passed).toBe(true);
  });

  it('does nothing when autoFix is disabled', async () => {
    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [createFix({ gateId: 'mock' })],
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [],
      context,
      initialResults,
      { maxFixRounds: 3, autoFix: false },
    );

    expect(result.fixesApplied).toBe(0);
    expect(result.fixRoundsUsed).toBe(0);
  });

  it('does nothing when maxFixRounds is 0', async () => {
    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [createFix({ gateId: 'mock' })],
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [],
      context,
      initialResults,
      { maxFixRounds: 0, autoFix: true },
    );

    expect(result.fixesApplied).toBe(0);
    expect(result.fixRoundsUsed).toBe(0);
  });

  it('stops when no fixes are available', async () => {
    const mockGate: GatePlugin = {
      id: 'mock',
      name: 'Mock',
      version: '1.0.0',
      priority: 0,
      fixable: true,
      async run(): Promise<GateResult> {
        return {
          gateId: 'mock',
          score: 0.5,
          passed: false,
          findings: [],
          fixes: [],  // No fixes!
          durationMs: 0,
        };
      },
    };

    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [],  // No fixes
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [mockGate],
      context,
      initialResults,
      { maxFixRounds: 5, autoFix: true },
    );

    expect(result.fixRoundsUsed).toBe(0);
    expect(result.fixesApplied).toBe(0);
  });

  it('handles gate failures during fix rounds gracefully', async () => {
    const mockGate: GatePlugin = {
      id: 'mock',
      name: 'Mock',
      version: '1.0.0',
      priority: 0,
      fixable: true,
      async run(): Promise<GateResult> {
        throw new Error('Gate crashed');
      },
    };

    const context = createGateContext();
    const initialResults: GateResult[] = [{
      gateId: 'mock',
      score: 0.5,
      passed: false,
      findings: [],
      fixes: [createFix({ gateId: 'mock' })],
      durationMs: 0,
    }];

    const result = await runFixEngine(
      [mockGate],
      context,
      initialResults,
      { maxFixRounds: 3, autoFix: true },
    );

    // Should not throw, should handle gracefully
    expect(result.fixRoundsUsed).toBeGreaterThan(0);
  });
});
