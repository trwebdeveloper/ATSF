import { describe, it, expect } from 'vitest';
import { testabilityGate, findVaguePatterns } from '../../../src/gates/testability.js';
import { createGateContext, createMinimalArtifactSet } from './helpers.js';

describe('Testability Gate', () => {
  it('has correct metadata', () => {
    expect(testabilityGate.id).toBe('testability');
    expect(testabilityGate.name).toBe('Testability Gate');
    expect(testabilityGate.priority).toBe(4);
    expect(testabilityGate.fixable).toBe(true);
  });

  it('produces GateResult with findings', async () => {
    const context = createGateContext();
    const result = await testabilityGate.run(context);

    expect(result.gateId).toBe('testability');
    expect(typeof result.score).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes for clean, specific statements', async () => {
    const context = createGateContext();
    const result = await testabilityGate.run(context);

    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.findings.filter(f => f.ruleId === 'testability-vague')).toHaveLength(0);
  });

  describe('VAGUE_PATTERNS', () => {
    it('detects "should be fast"', () => {
      expect(findVaguePatterns('The system should be fast')).toHaveLength(1);
    });

    it('detects "should be efficient"', () => {
      expect(findVaguePatterns('This should be efficient')).toHaveLength(1);
    });

    it('detects "should be scalable"', () => {
      expect(findVaguePatterns('The API should be scalable')).toHaveLength(1);
    });

    it('detects "if needed"', () => {
      expect(findVaguePatterns('Add caching if needed')).toHaveLength(1);
    });

    it('detects "if necessary"', () => {
      expect(findVaguePatterns('Refactor if necessary')).toHaveLength(1);
    });

    it('detects "if appropriate"', () => {
      expect(findVaguePatterns('Use memoization if appropriate')).toHaveLength(1);
    });

    it('detects "etc."', () => {
      expect(findVaguePatterns('Handle errors, timeouts, etc.')).toHaveLength(1);
    });

    it('detects "etc" without dot', () => {
      expect(findVaguePatterns('Handle errors, timeouts, etc')).toHaveLength(1);
    });

    it('detects "and so on"', () => {
      expect(findVaguePatterns('Handle errors and so on')).toHaveLength(1);
    });

    it('detects "and more"', () => {
      expect(findVaguePatterns('Support logging and more')).toHaveLength(1);
    });

    it('detects "various things"', () => {
      expect(findVaguePatterns('Handle various errors')).toHaveLength(1);
    });

    it('detects "several items"', () => {
      expect(findVaguePatterns('Process several items')).toHaveLength(1);
    });

    it('detects "some modules"', () => {
      expect(findVaguePatterns('Import some modules')).toHaveLength(1);
    });

    it('detects "many features"', () => {
      expect(findVaguePatterns('Support many features')).toHaveLength(1);
    });

    it('does not flag specific statements', () => {
      expect(findVaguePatterns('Return HTTP 200 with JSON body')).toHaveLength(0);
    });

    it('does not flag "should return"', () => {
      expect(findVaguePatterns('should return a valid response')).toHaveLength(0);
    });
  });

  it('detects vague task descriptions', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'The system should be fast and handle various errors etc.',
    };

    const context = createGateContext({ artifacts });
    const result = await testabilityGate.run(context);

    expect(result.score).toBeLessThan(1.0);
    const vagueFindings = result.findings.filter(f => f.ruleId === 'testability-vague');
    expect(vagueFindings.length).toBeGreaterThan(0);
  });

  it('generates BDD-style fixes for vague statements', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'The system should be efficient',
    };

    const context = createGateContext({ artifacts });
    const result = await testabilityGate.run(context);

    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.fixes[0].gateId).toBe('testability');
    expect(result.fixes[0].fix.type).toBe('replace');
    const fixValue = result.fixes[0].fix.value as string;
    expect(fixValue).toContain('Given');
    expect(fixValue).toContain('When');
    expect(fixValue).toContain('Then');
  });

  it('calculates score as 1.0 - (vagueStatements / totalStatements)', async () => {
    const artifacts = createMinimalArtifactSet();
    // Make exactly one statement vague out of the total
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Handle various errors if needed',
    };

    const context = createGateContext({ artifacts });
    const result = await testabilityGate.run(context);

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1.0);
  });

  it('returns early on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createGateContext({ signal: controller.signal });
    const result = await testabilityGate.run(context);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });
});
