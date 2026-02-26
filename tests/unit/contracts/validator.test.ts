import { describe, it, expect } from 'vitest';
import { validateAgentOutput } from '../../../src/contracts/validator.js';
import type { ValidationResult } from '../../../src/contracts/validator.js';

/* ------------------------------------------------------------------ */
/*  Helper: valid 9-field agent output                                 */
/* ------------------------------------------------------------------ */
function validAgentOutput() {
  return {
    assumptions: [
      {
        id: 'ASMP-001',
        description: 'The system will use PostgreSQL as the primary database',
        source: 'user' as const,
        confidence: 0.9,
        validatedBy: null,
      },
    ],
    findings: [
      {
        id: 'FIND-001',
        description: 'PostgreSQL provides strong ACID compliance for transactions',
        evidence: ['PostgreSQL docs section 13.2'],
        assumptionRefs: ['ASMP-001'],
        severity: 'major' as const,
      },
    ],
    decisions: [
      {
        id: 'DEC-001',
        title: 'Use PostgreSQL for storage',
        findingRef: 'FIND-001',
        chosenOption: 'PostgreSQL 16',
        rationale: 'Based on the finding that PostgreSQL provides strong ACID compliance',
        status: 'accepted' as const,
      },
    ],
    recommendations: [
      {
        id: 'REC-001',
        description: 'Implement connection pooling with pgBouncer',
        decisionRef: 'DEC-001',
        priority: 'high' as const,
        effort: 'medium' as const,
      },
    ],
    risks: [],
    constraints: [],
    dependencies: [],
    interfaces: [],
    metadata: {
      agentId: 'agent-001',
      agentType: 'architect',
      timestamp: '2024-01-15T10:30:00Z',
      model: 'gpt-4',
      tokenUsage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      duration: 12.5,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  L1 Validation: Shape (structural Zod parse)                        */
/* ------------------------------------------------------------------ */
describe('L1 Validation (Shape)', () => {
  it('passes for structurally valid output', async () => {
    const result: ValidationResult = await validateAgentOutput(validAgentOutput(), 1);
    expect(result.valid).toBe(true);
    expect(result.level).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for completely invalid input', async () => {
    const result = await validateAgentOutput({ bad: 'data' }, 1);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails when a required field is missing', async () => {
    const output = validAgentOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (output as any).metadata;
    const result = await validateAgentOutput(output, 1);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(1);
  });

  it('fails when a nested field has wrong type', async () => {
    const output = validAgentOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (output.metadata as any).tokenUsage.promptTokens = 'not-a-number';
    const result = await validateAgentOutput(output, 1);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  L2 Validation: Deep (cross-field superRefine)                      */
/* ------------------------------------------------------------------ */
describe('L2 Validation (Deep)', () => {
  it('passes when all cross-field references are valid', async () => {
    const result = await validateAgentOutput(validAgentOutput(), 2);
    expect(result.valid).toBe(true);
    expect(result.level).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when decision references non-existent finding', async () => {
    const output = validAgentOutput();
    output.decisions[0].findingRef = 'FIND-999';
    const result = await validateAgentOutput(output, 2);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(2);
    expect(result.errors.some((e) => e.message.includes('FIND-999'))).toBe(true);
  });

  it('fails when finding references non-existent assumption', async () => {
    const output = validAgentOutput();
    output.findings[0].assumptionRefs = ['ASMP-999'];
    const result = await validateAgentOutput(output, 2);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(2);
  });

  it('fails when recommendation references non-existent decision', async () => {
    const output = validAgentOutput();
    output.recommendations[0].decisionRef = 'DEC-999';
    const result = await validateAgentOutput(output, 2);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(2);
  });

  it('structural failure at L1 prevents L2 from running', async () => {
    // If L1 fails, we should get L1 errors, not L2 errors
    const result = await validateAgentOutput({ bad: 'data' }, 2);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  L3 Validation: Cross-Agent (stub)                                  */
/* ------------------------------------------------------------------ */
describe('L3 Validation (Cross-Agent)', () => {
  it('passes with valid output and empty cross-agent context', async () => {
    const context = new Map<string, unknown>();
    const result = await validateAgentOutput(validAgentOutput(), 3, context);
    expect(result.valid).toBe(true);
    expect(result.level).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it('throws if cross-agent context is not provided for L3', async () => {
    await expect(
      validateAgentOutput(validAgentOutput(), 3),
    ).rejects.toThrow('L3 validation requires crossAgentContext');
  });

  it('structural failure at L1 prevents L3 from running', async () => {
    const context = new Map<string, unknown>();
    const result = await validateAgentOutput({ bad: 'data' }, 3, context);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(1);
  });

  it('cross-field failure at L2 prevents L3 from running', async () => {
    const output = validAgentOutput();
    output.decisions[0].findingRef = 'FIND-999';
    const context = new Map<string, unknown>();
    const result = await validateAgentOutput(output, 3, context);
    expect(result.valid).toBe(false);
    expect(result.level).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Error path quality                                                 */
/* ------------------------------------------------------------------ */
describe('Error path quality', () => {
  it('produces meaningful error paths for nested validation errors', async () => {
    const output = validAgentOutput();
    output.assumptions[0].id = 'INVALID-FORMAT';
    const result = await validateAgentOutput(output, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Check that error includes path information
    const hasPath = result.errors.some(
      (e) => e.path && e.path.length > 0,
    );
    expect(hasPath).toBe(true);
  });
});
