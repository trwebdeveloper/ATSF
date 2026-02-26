/**
 * Integration tests for OrchestratorEngine + Pipeline factory (T14).
 *
 * Tests verify:
 * 1. createPipeline(config) creates all subsystems
 * 2. OrchestratorEngine.run() executes in order: debate -> build -> gate -> emit
 * 3. EventBus receives events from all subsystems
 * 4. OrchestratorResult includes success, artifacts, executionSnapshot, totalCostUsd, durationMs
 * 5. BudgetExceededError caught at orchestrator boundary, sets success=false
 * 6. AbortSignal propagated through entire pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPipeline } from '../../src/orchestrator/pipeline.js';
import { createOrchestratorEngine } from '../../src/orchestrator/engine.js';
import type { OrchestratorConfig } from '../../src/orchestrator/engine.js';
import { ResilienceLayer } from '../../src/resilience/resilience-layer.js';
import { GraphBuilder } from '../../src/dag/static/graph-builder.js';
import { DebateEngine } from '../../src/debate/engine.js';
import { GateOrchestrator } from '../../src/gates/orchestrator.js';
import { EmitterPipeline } from '../../src/emitter/pipeline.js';
import { createMockProvider, MockProvider } from '../helpers/mock-provider.js';
import { BudgetExceededError } from '../../src/shared/errors.js';
import type { ATSFEvent } from '../../src/events/types.js';
import { resolveOrchestratorConfig } from '../../src/orchestrator/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal OrchestratorConfig for testing.
 */
function makeConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    inputPath: '/tmp/atsf-test/input.yaml',
    workspaceRoot: '/tmp/atsf-test',
    providers: ['mock-provider'],
    maxConcurrency: 2,
    interactive: false,
    ...overrides,
  };
}

/**
 * Create a MockProvider that returns valid JSON for debate engine calls.
 */
function makeDebateMockProvider(): MockProvider {
  return createMockProvider('mock-provider', {
    response: {
      content: JSON.stringify({
        option: 'Option A',
        rationale: 'Because it is the best',
        tradeoffs: ['trade1'],
        evidence: ['evidence1'],
        agentId: 'critic-0',
        strengths: ['strong'],
        weaknesses: ['weak'],
        questions: ['why?'],
        // Judge fields
        chosenOption: 'Option A',
        consensusScore: 0.9,
        confidenceScore: 0.85,
        dissent: [],
        requiresHumanReview: false,
        convergenceAchieved: true,
      }),
      model: 'mock-model',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    },
  });
}

// ---------------------------------------------------------------------------
// Test Suite 1: createPipeline
// ---------------------------------------------------------------------------

describe('createPipeline', () => {
  it('creates all subsystems from config', () => {
    const mockProvider = makeDebateMockProvider();
    const pipeline = createPipeline(makeConfig(), mockProvider);

    expect(pipeline.eventBus).toBeDefined();
    expect(pipeline.eventBus.on).toBeTypeOf('function');
    expect(pipeline.eventBus.emit).toBeTypeOf('function');

    expect(pipeline.resilience).toBeDefined();
    expect(pipeline.resilience).toBeInstanceOf(ResilienceLayer);

    expect(pipeline.providerRegistry).toBeDefined();
    expect(pipeline.providerRegistry.getDefault()).toBe(mockProvider);

    expect(pipeline.graphBuilder).toBeDefined();
    expect(pipeline.graphBuilder).toBeInstanceOf(GraphBuilder);

    expect(pipeline.debateEngine).toBeDefined();
    expect(pipeline.debateEngine).toBeInstanceOf(DebateEngine);

    expect(pipeline.gateOrchestrator).toBeDefined();
    expect(pipeline.gateOrchestrator).toBeInstanceOf(GateOrchestrator);

    expect(pipeline.emitterPipeline).toBeDefined();
    expect(pipeline.emitterPipeline).toBeInstanceOf(EmitterPipeline);
  });

  it('registers the provider in the registry', () => {
    const mockProvider = makeDebateMockProvider();
    const pipeline = createPipeline(makeConfig(), mockProvider);

    expect(pipeline.providerRegistry.get('mock-provider')).toBe(mockProvider);
  });

  it('wires EventBus through all subsystems', () => {
    const mockProvider = makeDebateMockProvider();
    const pipeline = createPipeline(makeConfig(), mockProvider);

    // The EventBus is the shared bus; we can subscribe to it
    const events: ATSFEvent[] = [];
    pipeline.eventBus.on('debate.started', (e) => events.push(e));

    // Emit a test event to verify the bus is alive
    pipeline.eventBus.emit({
      type: 'debate.started',
      topic: 'test',
      proposerCount: 2,
      timestamp: new Date(),
      source: 'test',
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('debate.started');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: OrchestratorEngine.run() execution order
// ---------------------------------------------------------------------------

describe('OrchestratorEngine.run()', () => {
  let mockProvider: MockProvider;
  let config: OrchestratorConfig;

  beforeEach(() => {
    mockProvider = makeDebateMockProvider();
    config = makeConfig();
  });

  it('returns OrchestratorResult with required fields', async () => {
    const pipeline = createPipeline(config, mockProvider);

    // Replace subsystem methods with stubs to control execution
    vi.spyOn(pipeline.debateEngine, 'runDebate').mockResolvedValue({
      chosenOption: 'Option A',
      rationale: 'Best option',
      consensusScore: 0.9,
      confidenceScore: 0.85,
      dissent: [],
      requiresHumanReview: false,
      convergenceAchieved: true,
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockResolvedValue({
      timestamp: new Date(),
      duration: 100,
      gates: [],
      overallScore: 1.0,
      passed: true,
      fixesApplied: 0,
      fixRoundsUsed: 0,
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockResolvedValue(undefined);

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);

    // Verify result shape
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('artifacts');
    expect(result).toHaveProperty('executionSnapshot');
    expect(result).toHaveProperty('totalCostUsd');
    expect(result).toHaveProperty('durationMs');

    expect(typeof result.success).toBe('boolean');
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(typeof result.totalCostUsd).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('executes phases in order: debate -> build -> gate -> emit', async () => {
    const pipeline = createPipeline(config, mockProvider);
    const executionOrder: string[] = [];

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockImplementation(async () => {
      executionOrder.push('debate');
      return {
        chosenOption: 'A',
        rationale: 'r',
        consensusScore: 0.9,
        confidenceScore: 0.85,
        dissent: [],
        requiresHumanReview: false,
        convergenceAchieved: true,
      };
    });

    // The "build" phase is the graph builder - we spy on build()
    vi.spyOn(pipeline.graphBuilder, 'build').mockImplementation(() => {
      executionOrder.push('build');
      return {
        nodes: new Map(),
        edges: [],
        layers: [],
        fileConflicts: [],
        criticalPath: [],
      };
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockImplementation(async () => {
      executionOrder.push('gate');
      return {
        timestamp: new Date(),
        duration: 10,
        gates: [],
        overallScore: 1.0,
        passed: true,
        fixesApplied: 0,
        fixRoundsUsed: 0,
      };
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockImplementation(async () => {
      executionOrder.push('emit');
    });

    const engine = createOrchestratorEngine(pipeline);
    await engine.run(config);

    // Verify ordering (some phases may be skipped if empty, but order must hold)
    const debateIdx = executionOrder.indexOf('debate');
    const buildIdx = executionOrder.indexOf('build');
    const gateIdx = executionOrder.indexOf('gate');
    const emitIdx = executionOrder.indexOf('emit');

    // debate should come before build
    if (debateIdx >= 0 && buildIdx >= 0) {
      expect(debateIdx).toBeLessThan(buildIdx);
    }
    // build should come before gate
    if (buildIdx >= 0 && gateIdx >= 0) {
      expect(buildIdx).toBeLessThan(gateIdx);
    }
    // gate should come before emit
    if (gateIdx >= 0 && emitIdx >= 0) {
      expect(gateIdx).toBeLessThan(emitIdx);
    }
  });

  it('exposes eventBus on the engine instance', () => {
    const pipeline = createPipeline(config, mockProvider);
    const engine = createOrchestratorEngine(pipeline);

    expect(engine.eventBus).toBeDefined();
    expect(engine.eventBus).toBe(pipeline.eventBus);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: EventBus integration
// ---------------------------------------------------------------------------

describe('EventBus integration with OrchestratorEngine', () => {
  it('EventBus receives events during run()', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);
    const events: ATSFEvent[] = [];

    // Spy on debate to emit events via the real event bus
    vi.spyOn(pipeline.debateEngine, 'runDebate').mockImplementation(async () => {
      pipeline.eventBus.emit({
        type: 'debate.started',
        topic: 'test-topic',
        proposerCount: 2,
        timestamp: new Date(),
        source: 'debate-engine',
      });
      return {
        chosenOption: 'A',
        rationale: 'r',
        consensusScore: 0.9,
        confidenceScore: 0.85,
        dissent: [],
        requiresHumanReview: false,
        convergenceAchieved: true,
      };
    });

    vi.spyOn(pipeline.graphBuilder, 'build').mockReturnValue({
      nodes: new Map(),
      edges: [],
      layers: [],
      fileConflicts: [],
      criticalPath: [],
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockResolvedValue({
      timestamp: new Date(),
      duration: 10,
      gates: [],
      overallScore: 1.0,
      passed: true,
      fixesApplied: 0,
      fixRoundsUsed: 0,
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockResolvedValue(undefined);

    // Subscribe to events
    pipeline.eventBus.on('debate.started', (e) => events.push(e));

    const engine = createOrchestratorEngine(pipeline);
    await engine.run(config);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const debateEvent = events.find((e) => e.type === 'debate.started');
    expect(debateEvent).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: OrchestratorResult shape
// ---------------------------------------------------------------------------

describe('OrchestratorResult completeness', () => {
  it('executionSnapshot has all required fields', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockResolvedValue({
      chosenOption: 'A',
      rationale: 'r',
      consensusScore: 0.9,
      confidenceScore: 0.85,
      dissent: [],
      requiresHumanReview: false,
      convergenceAchieved: true,
    });

    vi.spyOn(pipeline.graphBuilder, 'build').mockReturnValue({
      nodes: new Map(),
      edges: [],
      layers: [],
      fileConflicts: [],
      criticalPath: [],
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockResolvedValue({
      timestamp: new Date(),
      duration: 10,
      gates: [],
      overallScore: 1.0,
      passed: true,
      fixesApplied: 0,
      fixRoundsUsed: 0,
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockResolvedValue(undefined);

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);

    // Check snapshot shape
    const snap = result.executionSnapshot;
    expect(snap).toHaveProperty('completedTasks');
    expect(snap).toHaveProperty('failedTasks');
    expect(snap).toHaveProperty('pendingTasks');
    expect(snap).toHaveProperty('runningTasks');
    expect(snap).toHaveProperty('skippedTasks');
    expect(snap).toHaveProperty('totalCostUsd');
    expect(snap).toHaveProperty('elapsedMs');

    // With mocked (empty) pipeline, success should be true
    expect(result.success).toBe(true);
  });

  it('reports success=true when all gates pass', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockResolvedValue({
      chosenOption: 'A',
      rationale: 'r',
      consensusScore: 0.9,
      confidenceScore: 0.85,
      dissent: [],
      requiresHumanReview: false,
      convergenceAchieved: true,
    });

    vi.spyOn(pipeline.graphBuilder, 'build').mockReturnValue({
      nodes: new Map(),
      edges: [],
      layers: [],
      fileConflicts: [],
      criticalPath: [],
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockResolvedValue({
      timestamp: new Date(),
      duration: 10,
      gates: [],
      overallScore: 1.0,
      passed: true,
      fixesApplied: 0,
      fixRoundsUsed: 0,
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockResolvedValue(undefined);

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);
    expect(result.success).toBe(true);
  });

  it('reports success=false when gates fail', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockResolvedValue({
      chosenOption: 'A',
      rationale: 'r',
      consensusScore: 0.9,
      confidenceScore: 0.85,
      dissent: [],
      requiresHumanReview: false,
      convergenceAchieved: true,
    });

    vi.spyOn(pipeline.graphBuilder, 'build').mockReturnValue({
      nodes: new Map(),
      edges: [],
      layers: [],
      fileConflicts: [],
      criticalPath: [],
    });

    vi.spyOn(pipeline.gateOrchestrator, 'run').mockResolvedValue({
      timestamp: new Date(),
      duration: 10,
      gates: [{
        gateId: 'test-gate',
        score: 0.3,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: 5,
      }],
      overallScore: 0.3,
      passed: false,
      fixesApplied: 0,
      fixRoundsUsed: 0,
    });

    vi.spyOn(pipeline.emitterPipeline, 'run').mockResolvedValue(undefined);

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: BudgetExceededError handling
// ---------------------------------------------------------------------------

describe('BudgetExceededError at orchestrator boundary', () => {
  it('catches BudgetExceededError and returns success=false', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockRejectedValue(
      new BudgetExceededError(15.0, 10.0),
    );

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);

    expect(result.success).toBe(false);
    expect(result.totalCostUsd).toBeTypeOf('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not throw BudgetExceededError to the caller', async () => {
    const mockProvider = makeDebateMockProvider();
    const config = makeConfig();
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockRejectedValue(
      new BudgetExceededError(15.0, 10.0),
    );

    const engine = createOrchestratorEngine(pipeline);
    // Should NOT throw
    await expect(engine.run(config)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: AbortSignal propagation
// ---------------------------------------------------------------------------

describe('AbortSignal propagation', () => {
  it('respects pre-aborted signal', async () => {
    const mockProvider = makeDebateMockProvider();
    const controller = new AbortController();
    controller.abort();

    const config = makeConfig({ signal: controller.signal });
    const pipeline = createPipeline(config, mockProvider);

    vi.spyOn(pipeline.debateEngine, 'runDebate').mockResolvedValue({
      chosenOption: 'A',
      rationale: 'r',
      consensusScore: 0.9,
      confidenceScore: 0.85,
      dissent: [],
      requiresHumanReview: false,
      convergenceAchieved: true,
    });

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);

    // With an already-aborted signal, the engine should bail out early
    expect(result.success).toBe(false);
  });

  it('respects signal aborted during execution', async () => {
    const mockProvider = makeDebateMockProvider();
    const controller = new AbortController();

    const config = makeConfig({ signal: controller.signal });
    const pipeline = createPipeline(config, mockProvider);

    // Abort during the debate phase
    vi.spyOn(pipeline.debateEngine, 'runDebate').mockImplementation(async () => {
      controller.abort();
      throw new Error('AbortSignal: operation was aborted');
    });

    const engine = createOrchestratorEngine(pipeline);
    const result = await engine.run(config);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 7: resolveOrchestratorConfig
// ---------------------------------------------------------------------------

describe('resolveOrchestratorConfig', () => {
  it('resolves OrchestratorConfig from ATSFConfig defaults', () => {
    const resolved = resolveOrchestratorConfig({
      inputPath: '/tmp/input.yaml',
      workspaceRoot: '/tmp/workspace',
    });

    expect(resolved.inputPath).toBe('/tmp/input.yaml');
    expect(resolved.workspaceRoot).toBe('/tmp/workspace');
    expect(resolved.providers).toBeDefined();
    expect(Array.isArray(resolved.providers)).toBe(true);
    expect(typeof resolved.maxConcurrency).toBe('number');
  });

  it('merges overrides correctly', () => {
    const resolved = resolveOrchestratorConfig({
      inputPath: '/tmp/input.yaml',
      workspaceRoot: '/tmp/workspace',
      maxConcurrency: 10,
      interactive: true,
    });

    expect(resolved.maxConcurrency).toBe(10);
    expect(resolved.interactive).toBe(true);
  });
});
