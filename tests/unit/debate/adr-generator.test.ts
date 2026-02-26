import { describe, it, expect } from 'vitest';
import { ADRGenerator } from '../../../src/debate/adr-generator.js';
import type { Decision, Proposal, Critique } from '../../../src/debate/types.js';

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    chosenOption: 'PostgreSQL',
    rationale: 'Mature, ACID-compliant, excellent TypeScript support via Prisma',
    consensusScore: 0.85,
    confidenceScore: 0.9,
    dissent: [
      {
        agent: 'proposer-1',
        position: 'MongoDB',
        reason: 'Better horizontal scaling',
      },
    ],
    requiresHumanReview: false,
    convergenceAchieved: true,
    ...overrides,
  };
}

function makeProposals(): Proposal[] {
  return [
    {
      agentId: 'proposer-0',
      option: 'PostgreSQL',
      rationale: 'ACID-compliant with great TypeScript tooling',
      tradeoffs: ['Vertical scaling limits'],
      evidence: ['Prisma ORM support'],
    },
    {
      agentId: 'proposer-1',
      option: 'MongoDB',
      rationale: 'Flexible schema and horizontal scaling',
      tradeoffs: ['Eventual consistency'],
      evidence: ['Native sharding'],
    },
  ];
}

function makeCritiques(): Critique[] {
  return [
    {
      agentId: 'critic-0',
      targetProposal: 'proposer-0',
      strengths: ['Strong ACID guarantees'],
      weaknesses: ['Vertical scaling limitations'],
      questions: ['Migration strategy?'],
    },
    {
      agentId: 'critic-1',
      targetProposal: 'proposer-1',
      strengths: ['Flexible schema design'],
      weaknesses: ['Eventual consistency concerns'],
      questions: ['Transaction handling?'],
    },
  ];
}

describe('ADRGenerator', () => {
  it('generates ADR in MADR v4 format via Eta template', async () => {
    const generator = new ADRGenerator();
    const decision = makeDecision();
    const proposals = makeProposals();
    const critiques = makeCritiques();

    const adr = await generator.generate({
      topic: 'Database Selection for SaaS CRM',
      decision,
      proposals,
      critiques,
    });

    // Should have YAML front matter
    expect(adr).toMatch(/^---/);
    expect(adr).toContain('status:');
    expect(adr).toContain('date:');
    expect(adr).toContain('decision-makers:');

    // Should have MADR v4 sections
    expect(adr).toContain('# Database Selection for SaaS CRM');
    expect(adr).toContain('## Context and Problem Statement');
    expect(adr).toContain('## Considered Options');
    expect(adr).toContain('## Decision Outcome');
    expect(adr).toContain('Chosen option: "PostgreSQL"');
    expect(adr).toContain('### Consequences');
    expect(adr).toContain('### Confirmation');
    expect(adr).toContain('## Pros and Cons of the Options');
  });

  it('includes dissenting views section when dissent exists', async () => {
    const generator = new ADRGenerator();
    const decision = makeDecision();

    const adr = await generator.generate({
      topic: 'Database Selection',
      decision,
      proposals: makeProposals(),
      critiques: makeCritiques(),
    });

    expect(adr).toContain('### Dissenting Views');
    expect(adr).toContain('proposer-1');
    expect(adr).toContain('MongoDB');
    expect(adr).toContain('Better horizontal scaling');
  });

  it('omits dissenting views section when no dissent', async () => {
    const generator = new ADRGenerator();
    const decision = makeDecision({ dissent: [] });

    const adr = await generator.generate({
      topic: 'Database Selection',
      decision,
      proposals: makeProposals(),
      critiques: makeCritiques(),
    });

    expect(adr).not.toContain('### Dissenting Views');
  });

  it('includes confirmation note for non-convergence', async () => {
    const generator = new ADRGenerator();
    const decision = makeDecision({
      convergenceAchieved: false,
      consensusScore: 0.4,
    });

    const adr = await generator.generate({
      topic: 'Database Selection',
      decision,
      proposals: makeProposals(),
      critiques: makeCritiques(),
    });

    expect(adr).toContain('non-convergence');
  });

  it('builds MADRv4Data correctly from debate output', () => {
    const generator = new ADRGenerator();
    const decision = makeDecision();
    const proposals = makeProposals();
    const critiques = makeCritiques();

    const data = generator.buildMADRData({
      topic: 'Database Selection',
      decision,
      proposals,
      critiques,
    });

    expect(data.status).toBe('proposed');
    expect(data.title).toBe('Database Selection');
    expect(data.chosenOption).toBe('PostgreSQL');
    expect(data.rationale).toBeTruthy();
    expect(data.options.length).toBe(2);
    expect(data.dissent).toHaveLength(1);
    expect(data.consensusScore).toBe(0.85);
    expect(data.confidenceScore).toBe(0.9);
    expect(data.convergenceAchieved).toBe(true);
  });

  it('includes all proposal options in considered options', () => {
    const generator = new ADRGenerator();
    const proposals = makeProposals();
    const critiques = makeCritiques();
    const decision = makeDecision();

    const data = generator.buildMADRData({
      topic: 'Test',
      decision,
      proposals,
      critiques,
    });

    const optionNames = data.options.map(o => o.name);
    expect(optionNames).toContain('PostgreSQL');
    expect(optionNames).toContain('MongoDB');
  });

  it('maps critique strengths/weaknesses to option pros/cons', () => {
    const generator = new ADRGenerator();
    const proposals = makeProposals();
    const critiques = makeCritiques();
    const decision = makeDecision();

    const data = generator.buildMADRData({
      topic: 'Test',
      decision,
      proposals,
      critiques,
    });

    const pgOption = data.options.find(o => o.name === 'PostgreSQL');
    expect(pgOption).toBeTruthy();
    expect(pgOption!.pros).toBeTruthy();
    expect(pgOption!.cons).toBeTruthy();
  });

  it('generates dual format: markdown and YAML', async () => {
    const generator = new ADRGenerator();
    const decision = makeDecision();
    const proposals = makeProposals();
    const critiques = makeCritiques();

    const result = await generator.generateDualFormat({
      topic: 'Database Selection',
      decision,
      proposals,
      critiques,
      debateId: 'DB-001',
    });

    // Markdown format
    expect(result.markdown).toContain('# Database Selection');
    expect(result.markdown).toContain('## Decision Outcome');

    // YAML format (structured data)
    expect(result.yaml).toBeTruthy();
    expect(result.yaml).toContain('debateId:');
    expect(result.yaml).toContain('topic:');
    expect(result.yaml).toContain('convergenceScore:');
    expect(result.yaml).toContain('chosenOption:');
  });
});
