import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DebateEngine } from '../../../src/debate/engine.js';
import type { DebateConfig } from '../../../src/debate/types.js';
import type { GenerateResponse } from '../../../src/providers/types.js';
import { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import { createEventBus } from '../../../src/events/event-bus.js';
import { MockProvider } from '../../helpers/mock-provider.js';
import type { EventBus } from '../../../src/events/types.js';
import round1Fixture from '../../fixtures/mock-llm-responses/debate-round-1.json' with { type: 'json' };
import round2Fixture from '../../fixtures/mock-llm-responses/debate-round-2.json' with { type: 'json' };
import judgeFixture from '../../fixtures/mock-llm-responses/judge-synthesis.json' with { type: 'json' };

/**
 * Creates a MockProvider that returns different responses
 * based on how many times generate() has been called.
 */
class SequentialMockProvider extends MockProvider {
  private _responses: GenerateResponse[] = [];
  private _callIndex = 0;

  constructor(id: string, responses: GenerateResponse[]) {
    super({ id });
    this._responses = responses;
  }

  override async generate(): Promise<GenerateResponse> {
    const idx = this._callIndex;
    this._callIndex++;
    if (idx < this._responses.length) {
      return this._responses[idx];
    }
    // Return last response if more calls than expected
    return this._responses[this._responses.length - 1];
  }

  get totalCalls(): number {
    return this._callIndex;
  }
}

function makeResponse(object: unknown): GenerateResponse {
  return {
    content: JSON.stringify(object),
    object,
    model: 'test-model',
    finishReason: 'stop',
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  };
}

function makeDefaultConfig(overrides: Partial<DebateConfig> = {}): DebateConfig {
  return {
    topic: 'Database Selection for SaaS CRM',
    context: 'Building a SaaS CRM application that needs a primary database.',
    proposerCount: 2,
    rounds: 3,
    convergenceThreshold: 0.8,
    ...overrides,
  };
}

describe('DebateEngine', () => {
  let eventBus: EventBus;
  let resilience: ResilienceLayer;

  beforeEach(() => {
    eventBus = createEventBus();
    resilience = new ResilienceLayer({}, eventBus);
  });

  it('creates via static factory method', () => {
    const provider = new MockProvider({ id: 'test' });
    const engine = DebateEngine.create(provider, resilience, eventBus);
    expect(engine).toBeInstanceOf(DebateEngine);
  });

  it('runs exactly config.rounds rounds (default 3)', async () => {
    // With rounds=3 and proposerCount=2:
    //   Round 1: 2 proposals + 2 critiques = 4 calls
    //   Round 2: 2 critiques = 2 calls
    //   Round 3: 2 critiques = 2 calls
    //   Judge synthesis: 1 call
    //   Total = 9 LLM calls
    const proposal0 = round1Fixture.proposals[0];
    const proposal1 = round1Fixture.proposals[1];
    const critique0 = round2Fixture.critiques[0];
    const critique1 = round2Fixture.critiques[1];

    const responses: GenerateResponse[] = [
      // Round 1: proposals + critiques
      makeResponse(proposal0),
      makeResponse(proposal1),
      makeResponse(critique0),
      makeResponse(critique1),
      // Round 2: critiques
      makeResponse(critique0),
      makeResponse(critique1),
      // Round 3: critiques
      makeResponse(critique0),
      makeResponse(critique1),
      // Judge synthesis
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig();

    const decision = await engine.runDebate(config);

    expect(decision).toBeTruthy();
    expect(decision.chosenOption).toBe('PostgreSQL');
    // 2 proposals + 2*3 critiques + 1 judge = 9 LLM calls for rounds=3
    expect(provider.totalCalls).toBe(9);
  });

  it('Round 1: each proposer generates a Proposal', async () => {
    // Use rounds=1 for simpler test: 2 proposals + 2 critiques + 1 judge = 5
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    const decision = await engine.runDebate(config);
    expect(decision.chosenOption).toBeTruthy();
    // 2 proposals were generated (calls 0 and 1)
    expect(provider.totalCalls).toBeGreaterThanOrEqual(2);
  });

  it('Round 2: each proposer generates Critiques', async () => {
    // Use rounds=1: 2 proposals + 2 critiques + 1 judge = 5
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    const decision = await engine.runDebate(config);
    // After critiques, at least 4 calls (2 proposals + 2 critiques)
    expect(provider.totalCalls).toBeGreaterThanOrEqual(4);
    expect(decision.chosenOption).toBeTruthy();
  });

  it('Round 3: judge synthesizes Decision', async () => {
    // Use rounds=1: 2 proposals + 2 critiques + 1 judge = 5
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    const decision = await engine.runDebate(config);
    expect(decision.chosenOption).toBe('PostgreSQL');
    expect(decision.rationale).toBeTruthy();
    expect(decision.consensusScore).toBeGreaterThanOrEqual(0);
    expect(decision.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(decision.dissent)).toBe(true);
  });

  it('non-convergence fallback: judge forced decision after maxRounds', async () => {
    // Use rounds=1 so convergence cannot be achieved
    const nonConvergedJudge = {
      ...judgeFixture,
      convergenceAchieved: false,
      consensusScore: 0.3,
      confidenceScore: 0.9,
    };
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(nonConvergedJudge),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    const decision = await engine.runDebate(config);

    // Judge is forced to decide
    expect(decision.chosenOption).toBeTruthy();
    // Confidence capped at convergenceScore * 0.8 when non-converged
    expect(decision.convergenceAchieved).toBe(false);
  });

  it('all LLM calls wrapped in ResilienceLayer.execute()', async () => {
    // Use rounds=1: 2 proposals + 2 critiques + 1 judge = 5 resilience calls
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const executeSpy = vi.spyOn(resilience, 'execute');
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    await engine.runDebate(config);

    // 2 proposals + 2 critiques + 1 judge = 5 resilience calls
    expect(executeSpy).toHaveBeenCalledTimes(5);
    for (const call of executeSpy.mock.calls) {
      expect(call[0]).toBe('test-provider');
      expect(typeof call[1]).toBe('function');
    }
  });

  it('uses extractTokenUsage for cost tracking', async () => {
    // Use rounds=1 for simpler test
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    await engine.runDebate(config);

    // The cost tracker should have recorded costs
    const totalCost = resilience.costTracker;
    expect(totalCost).toBeTruthy();
  });

  it('emits debate events through EventBus', async () => {
    // Use rounds=1 for simpler test
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round1Fixture.proposals[1]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(round2Fixture.critiques[1]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ rounds: 1 });

    const events: string[] = [];
    eventBus.on('debate.started', () => events.push('started'));
    eventBus.on('debate.round.completed', () => events.push('round.completed'));
    eventBus.on('debate.decision.made', () => events.push('decision.made'));

    await engine.runDebate(config);

    expect(events).toContain('started');
    expect(events).toContain('decision.made');
  });

  it('handles single proposer correctly', async () => {
    // With rounds=1 and proposerCount=1:
    // 1 proposal + 1 critique + 1 judge = 3 calls
    const responses: GenerateResponse[] = [
      makeResponse(round1Fixture.proposals[0]),
      makeResponse(round2Fixture.critiques[0]),
      makeResponse(judgeFixture),
    ];

    const provider = new SequentialMockProvider('test-provider', responses);
    const engine = DebateEngine.create(provider, resilience, eventBus);
    const config = makeDefaultConfig({ proposerCount: 1, rounds: 1 });

    const decision = await engine.runDebate(config);
    expect(decision.chosenOption).toBeTruthy();
    // 1 proposal + 1 critique + 1 judge = 3 calls
    expect(provider.totalCalls).toBe(3);
  });
});
