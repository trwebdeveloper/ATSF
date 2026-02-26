import { describe, it, expect, vi } from 'vitest';
import { JudgeSynthesizer } from '../../../src/debate/judge.js';
import type { Proposal, Critique, DebateConfig } from '../../../src/debate/types.js';
import { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import { createEventBus } from '../../../src/events/event-bus.js';
import { createMockProvider } from '../../helpers/mock-provider.js';
import judgeFixture from '../../fixtures/mock-llm-responses/judge-synthesis.json' with { type: 'json' };

function makeProposals(): Proposal[] {
  return [
    {
      agentId: 'proposer-0',
      option: 'PostgreSQL',
      rationale: 'Mature, ACID-compliant',
      tradeoffs: ['Vertical scaling limits'],
      evidence: ['Prisma support'],
    },
    {
      agentId: 'proposer-1',
      option: 'MongoDB',
      rationale: 'Flexible schema, horizontal scaling',
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
      strengths: ['ACID guarantees'],
      weaknesses: ['Vertical scaling'],
      questions: ['Migration strategy?'],
    },
    {
      agentId: 'critic-1',
      targetProposal: 'proposer-1',
      strengths: ['Flexible schema'],
      weaknesses: ['Eventual consistency'],
      questions: ['Transaction support?'],
    },
  ];
}

describe('JudgeSynthesizer', () => {
  it('synthesizes a Decision from proposals and critiques', async () => {
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify(judgeFixture),
        object: judgeFixture,
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Database Selection',
      context: 'SaaS CRM application',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
    };

    const decision = await judge.synthesize(
      config,
      makeProposals(),
      makeCritiques(),
      0.85,
      true,
    );

    expect(decision.chosenOption).toBe('PostgreSQL');
    expect(decision.rationale).toBeTruthy();
    expect(decision.consensusScore).toBeGreaterThanOrEqual(0);
    expect(decision.consensusScore).toBeLessThanOrEqual(1);
    expect(decision.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(decision.confidenceScore).toBeLessThanOrEqual(1);
    expect(Array.isArray(decision.dissent)).toBe(true);
    expect(typeof decision.requiresHumanReview).toBe('boolean');
    expect(typeof decision.convergenceAchieved).toBe('boolean');
  });

  it('Decision.dissent is Array<{ agent, position, reason }>', async () => {
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify(judgeFixture),
        object: judgeFixture,
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Database Selection',
      context: 'SaaS CRM',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
    };

    const decision = await judge.synthesize(
      config,
      makeProposals(),
      makeCritiques(),
      0.85,
      true,
    );

    for (const d of decision.dissent) {
      expect(d).toHaveProperty('agent');
      expect(d).toHaveProperty('position');
      expect(d).toHaveProperty('reason');
      expect(typeof d.agent).toBe('string');
      expect(typeof d.position).toBe('string');
      expect(typeof d.reason).toBe('string');
    }
  });

  it('caps confidence when convergence not achieved', async () => {
    const nonConvergedJudge = {
      ...judgeFixture,
      convergenceAchieved: false,
      consensusScore: 0.4,
      confidenceScore: 0.9,
    };
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify(nonConvergedJudge),
        object: nonConvergedJudge,
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Database Selection',
      context: 'SaaS CRM',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
    };

    const decision = await judge.synthesize(
      config,
      makeProposals(),
      makeCritiques(),
      0.4,   // convergenceScore
      false,  // convergenceAchieved = false
    );

    // confidenceScore capped at convergenceScore * 0.8
    expect(decision.confidenceScore).toBeLessThanOrEqual(0.4 * 0.8);
    expect(decision.requiresHumanReview).toBe(true); // score < 0.5
    expect(decision.convergenceAchieved).toBe(false);
  });

  it('sets requiresHumanReview to true when convergenceScore < 0.5', async () => {
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify({ ...judgeFixture, consensusScore: 0.3 }),
        object: { ...judgeFixture, consensusScore: 0.3 },
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Test',
      context: 'Test',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
    };

    const decision = await judge.synthesize(
      config,
      makeProposals(),
      makeCritiques(),
      0.3,
      false,
    );

    expect(decision.requiresHumanReview).toBe(true);
  });

  it('wraps LLM call in ResilienceLayer.execute()', async () => {
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify(judgeFixture),
        object: judgeFixture,
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);
    const executeSpy = vi.spyOn(resilience, 'execute');

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Test',
      context: 'Test',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
    };

    await judge.synthesize(config, makeProposals(), makeCritiques(), 0.85, true);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(provider.id, expect.any(Function));
  });

  it('uses models.judge when specified', async () => {
    const provider = createMockProvider('test-provider', {
      response: {
        content: JSON.stringify(judgeFixture),
        object: judgeFixture,
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      },
    });
    const eventBus = createEventBus();
    const resilience = new ResilienceLayer({}, eventBus);

    const judge = new JudgeSynthesizer(provider, resilience, eventBus);
    const config: DebateConfig = {
      topic: 'Test',
      context: 'Test',
      proposerCount: 2,
      rounds: 3,
      convergenceThreshold: 0.8,
      models: { judge: 'anthropic/claude-opus-4' },
    };

    await judge.synthesize(config, makeProposals(), makeCritiques(), 0.85, true);

    expect(provider.lastRequest?.model).toBe('anthropic/claude-opus-4');
  });
});
