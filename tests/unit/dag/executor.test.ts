import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskExecutorImpl } from '../../../src/dag/runtime/executor.js';
import type { TaskNode } from '../../../src/dag/types.js';
import type { TaskId } from '../../../src/shared/types.js';
import type { ProviderAdapter, GenerateResponse, ProviderRegistry } from '../../../src/providers/types.js';
import type { EventBus } from '../../../src/events/types.js';
import { createEventBus } from '../../../src/events/event-bus.js';
import { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import { FileLockManager } from '../../../src/dag/runtime/file-lock-manager.js';
import { BudgetExceededError } from '../../../src/shared/errors.js';
import type { ExecutionContext } from '../../../src/dag/runtime/executor.js';

function makeNode(overrides: Partial<TaskNode> & { id: TaskId }): TaskNode {
  return {
    name: overrides.id,
    description: `Task ${overrides.id}`,
    type: 'planning',
    agent: 'test-provider',
    dependsOn: [],
    filesRead: [],
    filesWrite: [],
    layer: 0,
    fileConflicts: [],
    ...overrides,
  };
}

function makeProviderAdapter(overrides?: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    supportedModels: ['test-model'],
    generate: vi.fn().mockResolvedValue({
      content: 'generated output',
      model: 'test-model',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    } satisfies GenerateResponse),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeProviderRegistry(provider: ProviderAdapter): ProviderRegistry {
  return {
    register: vi.fn(),
    get: vi.fn().mockReturnValue(provider),
    getDefault: vi.fn().mockReturnValue(provider),
    list: vi.fn().mockReturnValue([provider]),
    healthCheckAll: vi.fn().mockResolvedValue(new Map([['test-provider', true]])),
  };
}

interface AgentDefinition {
  readonly provider: string;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
}

describe('TaskExecutorImpl', () => {
  let eventBus: EventBus;
  let resilience: ResilienceLayer;
  let lockManager: FileLockManager;
  let provider: ProviderAdapter;
  let registry: ProviderRegistry;
  let executor: TaskExecutorImpl;
  let context: ExecutionContext;
  const agentDefs = new Map<string, AgentDefinition>([
    ['test-provider', { provider: 'test-provider', model: 'test-model' }],
  ]);

  beforeEach(() => {
    eventBus = createEventBus();
    resilience = new ResilienceLayer({}, eventBus);
    lockManager = new FileLockManager({ lockTtlMs: 300_000, reapIntervalMs: 30_000 });
    provider = makeProviderAdapter();
    registry = makeProviderRegistry(provider);
    executor = new TaskExecutorImpl();
    context = {
      providerRegistry: registry,
      resilience,
      lockManager,
      eventBus,
      agentDefinitions: agentDefs,
    };
  });

  it('dispatches a task and returns TaskResult', async () => {
    const node = makeNode({ id: 'T1', filesWrite: ['src/a.ts'] });
    const result = await executor.dispatch(node, context);

    expect(result.taskId).toBe('T1');
    expect(result.tokenUsage.totalTokens).toBe(30);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.output).toBeDefined();
  });

  it('wraps provider calls in ResilienceLayer.execute()', async () => {
    const executeSpy = vi.spyOn(resilience, 'execute');
    const node = makeNode({ id: 'T1' });
    await executor.dispatch(node, context);

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('acquires file locks before execution and releases after', async () => {
    const acquireSpy = vi.spyOn(lockManager, 'acquire');
    const releaseSpy = vi.spyOn(lockManager, 'release');
    const node = makeNode({
      id: 'T1',
      filesWrite: ['src/a.ts'],
      filesRead: ['src/b.ts'],
    });

    await executor.dispatch(node, context);

    expect(acquireSpy).toHaveBeenCalledWith('T1', [
      { pattern: 'src/a.ts', mode: 'write' },
      { pattern: 'src/b.ts', mode: 'read' },
    ]);
    expect(releaseSpy).toHaveBeenCalledWith('T1');
  });

  it('releases locks even when execution fails', async () => {
    const releaseSpy = vi.spyOn(lockManager, 'release');
    const failingProvider = makeProviderAdapter({
      generate: vi.fn().mockRejectedValue(new Error('provider down')),
    });
    const failRegistry = makeProviderRegistry(failingProvider);

    const node = makeNode({ id: 'T1', filesWrite: ['src/a.ts'] });
    const failContext: ExecutionContext = {
      ...context,
      providerRegistry: failRegistry,
    };

    await expect(executor.dispatch(node, failContext)).rejects.toThrow('provider down');
    expect(releaseSpy).toHaveBeenCalledWith('T1');
  });

  it('emits task.started and task.completed events', async () => {
    const events: string[] = [];
    eventBus.on('task.started', () => events.push('started'));
    eventBus.on('task.completed', () => events.push('completed'));

    const node = makeNode({ id: 'T1' });
    await executor.dispatch(node, context);

    expect(events).toEqual(['started', 'completed']);
  });

  it('emits task.failed event on error', async () => {
    const events: string[] = [];
    eventBus.on('task.failed', () => events.push('failed'));

    const failingProvider = makeProviderAdapter({
      generate: vi.fn().mockRejectedValue(new Error('fail')),
    });
    const failRegistry = makeProviderRegistry(failingProvider);

    const node = makeNode({ id: 'T1' });
    const failContext: ExecutionContext = {
      ...context,
      providerRegistry: failRegistry,
    };

    await expect(executor.dispatch(node, failContext)).rejects.toThrow();
    expect(events).toEqual(['failed']);
  });

  it('passes AbortSignal through to resilience layer', async () => {
    const controller = new AbortController();
    const executeSpy = vi.spyOn(resilience, 'execute');

    const node = makeNode({ id: 'T1' });
    const signalContext: ExecutionContext = {
      ...context,
      signal: controller.signal,
    };
    await executor.dispatch(node, signalContext);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      controller.signal,
    );
  });

  it('converts filesWrite and filesRead to FileAccess[]', async () => {
    const acquireSpy = vi.spyOn(lockManager, 'acquire');

    const node = makeNode({
      id: 'T1',
      filesWrite: ['src/x.ts', 'src/y.ts'],
      filesRead: ['src/z.ts'],
    });

    await executor.dispatch(node, context);

    expect(acquireSpy).toHaveBeenCalledWith('T1', [
      { pattern: 'src/x.ts', mode: 'write' },
      { pattern: 'src/y.ts', mode: 'write' },
      { pattern: 'src/z.ts', mode: 'read' },
    ]);
  });

  it('propagates BudgetExceededError from resilience layer', async () => {
    vi.spyOn(resilience, 'execute').mockRejectedValue(
      new BudgetExceededError(100, 50),
    );

    const node = makeNode({ id: 'T1' });
    await expect(executor.dispatch(node, context)).rejects.toThrow(BudgetExceededError);
  });
});
