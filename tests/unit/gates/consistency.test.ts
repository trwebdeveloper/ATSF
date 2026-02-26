import { describe, it, expect } from 'vitest';
import { consistencyGate } from '../../../src/gates/consistency.js';
import {
  createGateContext,
  createMinimalArtifactSet,
} from './helpers.js';
import type { CrossRefValidationResult } from '../../../src/emitter/cross-ref-validator.js';
import type { ArtifactSet } from '../../../src/emitter/cross-ref-validator.js';

describe('Consistency Gate', () => {
  it('has correct metadata', () => {
    expect(consistencyGate.id).toBe('consistency');
    expect(consistencyGate.name).toBe('Consistency Gate');
    expect(consistencyGate.priority).toBe(2);
    expect(consistencyGate.fixable).toBe(true);
  });

  it('produces GateResult with findings', async () => {
    const context = createGateContext();
    const result = await consistencyGate.run(context);

    expect(result.gateId).toBe('consistency');
    expect(typeof result.score).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes when no cross-reference violations exist', async () => {
    const context = createGateContext();
    const result = await consistencyGate.run(context);

    expect(result.score).toBeGreaterThan(0);
    expect(result.passed).toBe(true);
  });

  it('detects cross-reference errors from validator', async () => {
    const validateCrossReferences = (_artifacts: ArtifactSet): CrossRefValidationResult => ({
      valid: false,
      errors: [
        {
          ruleId: 'XREF-001',
          ruleName: 'TaskGraph-to-Tickets 1:1 mapping',
          severity: 'error',
          message: 'Tasks have no corresponding ticket: TASK-999',
          offendingValues: ['TASK-999'],
        },
      ],
      warnings: [],
    });

    const context = createGateContext({ validateCrossReferences });
    const result = await consistencyGate.run(context);

    expect(result.score).toBeLessThan(1.0);
    const errorFindings = result.findings.filter(f => f.severity === 'error');
    expect(errorFindings.length).toBeGreaterThan(0);
    expect(errorFindings[0].ruleId).toBe('XREF-001');
  });

  it('reports warnings separately from errors', async () => {
    const validateCrossReferences = (_artifacts: ArtifactSet): CrossRefValidationResult => ({
      valid: true,
      errors: [],
      warnings: [
        {
          ruleId: 'XREF-013',
          ruleName: 'RepoBlueprint files cover TaskGraph filesWrite',
          severity: 'warning',
          message: 'Some files not covered',
          offendingValues: ['uncovered.ts'],
        },
      ],
    });

    const context = createGateContext({ validateCrossReferences });
    const result = await consistencyGate.run(context);

    const warningFindings = result.findings.filter(f => f.severity === 'warning');
    expect(warningFindings.length).toBeGreaterThan(0);
    // Warnings don't reduce score (only error findings affect it)
  });

  it('generates fixes for cross-reference errors', async () => {
    const validateCrossReferences = (_artifacts: ArtifactSet): CrossRefValidationResult => ({
      valid: false,
      errors: [
        {
          ruleId: 'XREF-001',
          ruleName: 'Task mapping',
          severity: 'error',
          message: 'Missing mapping',
          offendingValues: ['TASK-999'],
        },
      ],
      warnings: [],
    });

    const context = createGateContext({ validateCrossReferences });
    const result = await consistencyGate.run(context);

    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.fixes[0].gateId).toBe('consistency');
  });

  it('detects missing task dependency references', async () => {
    const artifacts = createMinimalArtifactSet();
    // Add a dependency to a non-existent task
    artifacts.taskGraph.tasks[1] = {
      ...artifacts.taskGraph.tasks[1],
      dependsOn: ['TASK-001', 'TASK-999'],
    };

    const context = createGateContext({ artifacts });
    const result = await consistencyGate.run(context);

    const depFindings = result.findings.filter(f => f.ruleId === 'consistency-dep-missing');
    expect(depFindings.length).toBeGreaterThan(0);
    expect(depFindings[0].message).toContain('TASK-999');
  });

  it('returns early on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createGateContext({ signal: controller.signal });
    const result = await consistencyGate.run(context);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});
