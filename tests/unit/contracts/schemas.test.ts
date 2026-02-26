import { describe, it, expect } from 'vitest';
import {
  AssumptionSchema,
  FindingSchema,
  DecisionSchema,
  RecommendationSchema,
  RiskSchema,
  ConstraintSchema,
  DependencySchema,
  InterfaceContractSchema,
  MetadataSchema,
  AgentOutputSchema,
  ValidatedAgentOutputSchema,
} from '../../../src/contracts/schemas.js';

/* ------------------------------------------------------------------ */
/*  Helper: valid fixture for all 9 fields                            */
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
    risks: [
      {
        id: 'RISK-001',
        description: 'Database migration complexity increases over time',
        probability: 'medium' as const,
        impact: 'major' as const,
        mitigation: 'Use versioned migration tool like Flyway',
      },
    ],
    constraints: [
      {
        id: 'CNST-001',
        description: 'Must support concurrent read access for 1000 users',
        type: 'technical' as const,
        source: 'performance requirements',
      },
    ],
    dependencies: [
      {
        id: 'DEP-001',
        name: 'pg',
        version: '8.11.0',
        purpose: 'PostgreSQL client for Node.js',
        license: 'MIT',
        risk: 'low' as const,
      },
    ],
    interfaces: [
      {
        id: 'INTF-001',
        name: 'UserAPI',
        type: 'api' as const,
        schema: '{ id: string, name: string }',
        producer: 'user-service',
        consumers: ['auth-service', 'profile-service'],
      },
    ],
    metadata: {
      agentId: 'agent-001',
      agentType: 'architect',
      timestamp: '2024-01-15T10:30:00Z',
      model: 'gpt-4',
      tokenUsage: {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      },
      duration: 12.5,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Per-record-type schemas                                           */
/* ------------------------------------------------------------------ */
describe('Per-record-type schemas', () => {
  describe('AssumptionSchema', () => {
    it('parses valid ASMP-NNN records', () => {
      const input = {
        id: 'ASMP-001',
        description: 'The system will use PostgreSQL as the primary database',
        source: 'user',
        confidence: 0.9,
        validatedBy: null,
      };
      expect(AssumptionSchema.parse(input)).toEqual(input);
    });

    it('rejects invalid id format', () => {
      const result = AssumptionSchema.safeParse({
        id: 'BAD-001',
        description: 'Some description here long enough',
        source: 'user',
        confidence: 0.5,
        validatedBy: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects description shorter than 10 chars', () => {
      const result = AssumptionSchema.safeParse({
        id: 'ASMP-001',
        description: 'Short',
        source: 'user',
        confidence: 0.5,
        validatedBy: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects confidence outside 0-1 range', () => {
      const result = AssumptionSchema.safeParse({
        id: 'ASMP-001',
        description: 'A valid description string',
        source: 'user',
        confidence: 1.5,
        validatedBy: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FindingSchema', () => {
    it('parses valid FIND-NNN records', () => {
      const input = {
        id: 'FIND-001',
        description: 'PostgreSQL is suitable for this workload',
        evidence: ['benchmark results'],
        assumptionRefs: ['ASMP-001'],
        severity: 'major',
      };
      expect(FindingSchema.parse(input)).toEqual(input);
    });

    it('rejects empty evidence array', () => {
      const result = FindingSchema.safeParse({
        id: 'FIND-001',
        description: 'PostgreSQL is suitable',
        evidence: [],
        assumptionRefs: [],
        severity: 'major',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DecisionSchema', () => {
    it('parses valid DEC-NNN records', () => {
      const input = {
        id: 'DEC-001',
        title: 'Use PostgreSQL',
        findingRef: 'FIND-001',
        chosenOption: 'PostgreSQL 16',
        rationale: 'Based on the finding that PostgreSQL provides strong ACID compliance',
        status: 'accepted',
      };
      expect(DecisionSchema.parse(input)).toEqual(input);
    });

    it('rejects rationale shorter than 20 chars', () => {
      const result = DecisionSchema.safeParse({
        id: 'DEC-001',
        title: 'Use PostgreSQL',
        findingRef: 'FIND-001',
        chosenOption: 'PostgreSQL',
        rationale: 'Too short',
        status: 'accepted',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RecommendationSchema', () => {
    it('parses valid REC-NNN records', () => {
      const input = {
        id: 'REC-001',
        description: 'Implement connection pooling with pgBouncer',
        decisionRef: 'DEC-001',
        priority: 'high',
        effort: 'medium',
      };
      expect(RecommendationSchema.parse(input)).toEqual(input);
    });
  });

  describe('RiskSchema', () => {
    it('parses valid RISK-NNN records', () => {
      const input = {
        id: 'RISK-001',
        description: 'Database migration complexity increases over time',
        probability: 'medium',
        impact: 'major',
        mitigation: 'Use versioned migrations',
      };
      expect(RiskSchema.parse(input)).toEqual(input);
    });
  });

  describe('ConstraintSchema', () => {
    it('parses valid CNST-NNN records', () => {
      const input = {
        id: 'CNST-001',
        description: 'Must support concurrent read access for 1000 users',
        type: 'technical',
        source: 'performance requirements',
      };
      expect(ConstraintSchema.parse(input)).toEqual(input);
    });
  });

  describe('DependencySchema', () => {
    it('parses valid DEP-NNN records', () => {
      const input = {
        id: 'DEP-001',
        name: 'pg',
        version: '8.11.0',
        purpose: 'PostgreSQL client',
        license: 'MIT',
        risk: 'low',
      };
      expect(DependencySchema.parse(input)).toEqual(input);
    });
  });

  describe('InterfaceContractSchema', () => {
    it('parses valid INTF-NNN records', () => {
      const input = {
        id: 'INTF-001',
        name: 'UserAPI',
        type: 'api',
        schema: '{ id: string }',
        producer: 'user-service',
        consumers: ['auth-service'],
      };
      expect(InterfaceContractSchema.parse(input)).toEqual(input);
    });
  });

  describe('MetadataSchema', () => {
    it('parses valid metadata', () => {
      const input = {
        agentId: 'agent-001',
        agentType: 'architect',
        timestamp: '2024-01-15T10:30:00Z',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
        duration: 12.5,
      };
      expect(MetadataSchema.parse(input)).toEqual(input);
    });

    it('rejects negative token counts', () => {
      const result = MetadataSchema.safeParse({
        agentId: 'agent-001',
        agentType: 'architect',
        timestamp: '2024-01-15T10:30:00Z',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: -1,
          completionTokens: 500,
          totalTokens: 1500,
        },
        duration: 12.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid datetime format', () => {
      const result = MetadataSchema.safeParse({
        agentId: 'agent-001',
        agentType: 'architect',
        timestamp: 'not-a-date',
        model: 'gpt-4',
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        duration: 1.0,
      });
      expect(result.success).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  AgentOutputSchema — 9 required fields                             */
/* ------------------------------------------------------------------ */
describe('AgentOutputSchema', () => {
  it('validates a complete 9-field agent output', () => {
    const output = validAgentOutput();
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('validates with empty arrays (except metadata)', () => {
    const output = {
      assumptions: [],
      findings: [],
      decisions: [],
      recommendations: [],
      risks: [],
      constraints: [],
      dependencies: [],
      interfaces: [],
      metadata: {
        agentId: 'agent-001',
        agentType: 'test',
        timestamp: '2024-01-15T10:30:00Z',
        model: 'gpt-4',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        duration: 0,
      },
    };
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('rejects when a required field is missing', () => {
    const output = validAgentOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (output as any).findings;
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  it('rejects when metadata is missing', () => {
    const output = validAgentOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (output as any).metadata;
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  it('invalid inputs produce meaningful error paths', () => {
    const output = validAgentOutput();
    output.assumptions[0].id = 'BAD-ID';
    const result = AgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path);
      // Should reference assumptions[0].id or similar
      expect(paths.length).toBeGreaterThan(0);
      const flatPaths = paths.map((p) => p.join('.'));
      expect(flatPaths.some((p) => p.includes('assumptions'))).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  ValidatedAgentOutputSchema — superRefine cross-field checks       */
/* ------------------------------------------------------------------ */
describe('ValidatedAgentOutputSchema (superRefine)', () => {
  it('passes when all references are valid', () => {
    const output = validAgentOutput();
    const result = ValidatedAgentOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('fails when decision references non-existent finding', () => {
    const output = validAgentOutput();
    output.decisions[0].findingRef = 'FIND-999';
    const result = ValidatedAgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('FIND-999'))).toBe(true);
    }
  });

  it('fails when finding references non-existent assumption', () => {
    const output = validAgentOutput();
    output.findings[0].assumptionRefs = ['ASMP-999'];
    const result = ValidatedAgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('ASMP-999'))).toBe(true);
    }
  });

  it('fails when recommendation references non-existent decision', () => {
    const output = validAgentOutput();
    output.recommendations[0].decisionRef = 'DEC-999';
    const result = ValidatedAgentOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('DEC-999'))).toBe(true);
    }
  });

  it('superRefine is not triggered on structurally invalid data', () => {
    // If base validation fails, superRefine should NOT run
    const result = ValidatedAgentOutputSchema.safeParse({ bad: 'data' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should only contain structural errors, not cross-field errors
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.every((m) => !m.includes('references non-existent'))).toBe(true);
    }
  });
});
