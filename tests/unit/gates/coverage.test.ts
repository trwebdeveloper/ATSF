import { describe, it, expect } from 'vitest';
import { coverageGate } from '../../../src/gates/coverage.js';
import { createGateContext, createMinimalArtifactSet } from './helpers.js';

describe('Coverage Gate', () => {
  it('has correct metadata', () => {
    expect(coverageGate.id).toBe('coverage');
    expect(coverageGate.name).toBe('Coverage Gate');
    expect(coverageGate.priority).toBe(3);
    expect(coverageGate.fixable).toBe(true);
  });

  it('produces GateResult with findings', async () => {
    const context = createGateContext();
    const result = await coverageGate.run(context);

    expect(result.gateId).toBe('coverage');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('scores 1.0 when all modules are covered by tasks', async () => {
    const context = createGateContext();
    const result = await coverageGate.run(context);

    // Minimal artifact set has src/feature-a.ts and src/feature-b.ts
    // Both are covered by TASK-001 and TASK-002 respectively
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.findings.filter(f => f.ruleId === 'coverage-module-uncovered')).toHaveLength(0);
  });

  it('detects uncovered modules', async () => {
    const artifacts = createMinimalArtifactSet();
    // Add an uncovered file to the blueprint
    artifacts.repoBlueprint.root[0].children!.push({
      name: 'uncovered.ts',
      type: 'file',
      purpose: 'An uncovered module',
    });

    const context = createGateContext({ artifacts });
    const result = await coverageGate.run(context);

    expect(result.score).toBeLessThan(1.0);
    const uncoveredFindings = result.findings.filter(f => f.ruleId === 'coverage-module-uncovered');
    expect(uncoveredFindings.length).toBeGreaterThan(0);
    expect(uncoveredFindings[0].message).toContain('uncovered.ts');
  });

  it('generates fixes for uncovered modules', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.repoBlueprint.root[0].children!.push({
      name: 'uncovered.ts',
      type: 'file',
      purpose: 'An uncovered module',
    });

    const context = createGateContext({ artifacts });
    const result = await coverageGate.run(context);

    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.fixes[0].gateId).toBe('coverage');
    expect(result.fixes[0].fix.type).toBe('insert');
  });

  it('returns early on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createGateContext({ signal: controller.signal });
    const result = await coverageGate.run(context);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('uses per-gate threshold from config', async () => {
    const artifacts = createMinimalArtifactSet();
    // Add 2 uncovered files (total 4 modules, 2 covered = 50% coverage)
    artifacts.repoBlueprint.root[0].children!.push(
      { name: 'uncovered1.ts', type: 'file', purpose: 'Uncovered 1' },
      { name: 'uncovered2.ts', type: 'file', purpose: 'Uncovered 2' },
    );

    // With low threshold, it should pass
    const context = createGateContext({
      artifacts,
      config: {
        threshold: 0.8,
        autoFix: true,
        maxFixRounds: 3,
        reporter: 'console' as const,
        gates: {
          coverage: { enabled: true, threshold: 0.4, autoFix: true, rules: {} },
          consistency: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
          testability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
          buildability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
          security: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
        },
        custom: [],
      },
    });
    const result = await coverageGate.run(context);

    expect(result.score).toBe(0.5);
    expect(result.passed).toBe(true);
  });
});
