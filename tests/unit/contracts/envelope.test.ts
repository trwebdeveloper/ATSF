import { describe, it, expect } from 'vitest';
import {
  V1PayloadSchema,
  V2PayloadSchema,
  VersionedEnvelope,
  ValidatedEnvelope,
} from '../../../src/contracts/envelope.js';

/* ------------------------------------------------------------------ */
/*  Helper: valid agent output for embedding in envelope               */
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
/*  V1PayloadSchema                                                    */
/* ------------------------------------------------------------------ */
describe('V1PayloadSchema', () => {
  it('parses a valid v1 envelope', () => {
    const envelope = {
      contractVersion: '1.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:abc123',
    };
    const result = V1PayloadSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('rejects wrong contract version', () => {
    const envelope = {
      contractVersion: '2.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:abc123',
    };
    const result = V1PayloadSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  V2PayloadSchema                                                    */
/* ------------------------------------------------------------------ */
describe('V2PayloadSchema', () => {
  it('parses a valid v2 envelope', () => {
    const envelope = {
      contractVersion: '2.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:def456',
      migrationLog: ['migrated field X from v1 format'],
    };
    const result = V2PayloadSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('rejects v2 envelope missing migrationLog', () => {
    const envelope = {
      contractVersion: '2.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:def456',
    };
    const result = V2PayloadSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  VersionedEnvelope (discriminated union)                            */
/* ------------------------------------------------------------------ */
describe('VersionedEnvelope', () => {
  it('discriminates v1 envelope correctly', () => {
    const envelope = {
      contractVersion: '1.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:abc123',
    };
    const result = VersionedEnvelope.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractVersion).toBe('1.0');
    }
  });

  it('discriminates v2 envelope correctly', () => {
    const envelope = {
      contractVersion: '2.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:def456',
      migrationLog: ['some migration note'],
    };
    const result = VersionedEnvelope.safeParse(envelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contractVersion).toBe('2.0');
    }
  });

  it('rejects unknown contract version', () => {
    const envelope = {
      contractVersion: '3.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:abc123',
    };
    const result = VersionedEnvelope.safeParse(envelope);
    expect(result.success).toBe(false);
  });

  it('rejects envelope with invalid agent output', () => {
    const envelope = {
      contractVersion: '1.0',
      agentOutput: { bad: 'data' },
      checksum: 'sha256:abc123',
    };
    const result = VersionedEnvelope.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  ValidatedEnvelope (superRefine on union)                           */
/* ------------------------------------------------------------------ */
describe('ValidatedEnvelope', () => {
  it('passes valid v1 envelope through validation', () => {
    const envelope = {
      contractVersion: '1.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:abc123',
    };
    const result = ValidatedEnvelope.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('passes valid v2 envelope through validation', () => {
    const envelope = {
      contractVersion: '2.0',
      agentOutput: validAgentOutput(),
      checksum: 'sha256:def456',
      migrationLog: ['migration step 1'],
    };
    const result = ValidatedEnvelope.safeParse(envelope);
    expect(result.success).toBe(true);
  });
});
