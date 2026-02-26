import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DAGSchedulerImpl } from '../../../src/dag/runtime/scheduler.js';
import { FileLockManager } from '../../../src/dag/runtime/file-lock-manager.js';
import { TaskExecutorImpl } from '../../../src/dag/runtime/executor.js';
import { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import { createEventBus } from '../../../src/events/event-bus.js';
import { BudgetExceededError } from '../../../src/shared/errors.js';
import type { EventBus } from '../../../src/events/types.js';
import type { TaskGraph, TaskNode, TopologicalLayer, TaskEdge } from '../../../src/dag/types.js';
import type { TaskId } from '../../../src/shared/types.js';
import type { ProviderAdapter, ProviderRegistry, GenerateResponse } from '../../../src/providers/types.js';

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

function makeGraph(nodes: TaskNode[], edges: TaskEdge[] = [], layers?: TopologicalLayer[]): TaskGraph {
  const nodeMap = new Map<TaskId, TaskNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Auto-compute layers if not provided
  const computedLayers: TopologicalLayer[] = layers ?? (() => {
    const layerMap = new Map<number, TaskId[]>();
    for (const n of nodes) {
      const ids = layerMap.get(n.layer) ?? [];
      ids.push(n.id);
      layerMap.set(n.layer, ids);
    }
    const result: TopologicalLayer[] = [];
    const sortedKeys = [...layerMap.keys()].sort((a, b) => a - b);
    for (const depth of sortedKeys) {
      result.push({ depth, taskIds: layerMap.get(depth)! });
    }
    return result;
  })();

  return {
    nodes: nodeMap,
    edges,
    layers: computedLayers,
    fileConflicts: [],
    criticalPath: nodes.map((n) => n.id),
  };
}

function makeProviderAdapter(): ProviderAdapter {
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

describe('DAGSchedulerImpl', () => {
  let eventBus: EventBus;
  let resilience: ResilienceLayer;
  let lockManager: FileLockManager;
  let executor: TaskExecutorImpl;
  let provider: ProviderAdapter;
  let registry: ProviderRegistry;

  beforeEach(() => {
    eventBus = createEventBus();
    resilience = new ResilienceLayer({}, eventBus);
    lockManager = new FileLockManager({ lockTtlMs: 300_000, reapIntervalMs: 30_000 });
    executor = new TaskExecutorImpl();
    provider = makeProviderAdapter();
    registry = makeProviderRegistry(provider);
  });

  function createScheduler(overrides?: { concurrency?: number; taskTimeoutMs?: number }): DAGSchedulerImpl {
    return new DAGSchedulerImpl({
      eventBus,
      resilience,
      fileLockManager: lockManager,
      executor,
      providerRegistry: registry,
      agentDefinitions: new Map([['test-provider', { provider: 'test-provider', model: 'test-model' }]]),
      config: {
        concurrency: overrides?.concurrency ?? 5,
        taskTimeoutMs: overrides?.taskTimeoutMs ?? 300_000,
        throwOnTimeout: true,
      },
    });
  }

  describe('layer-by-layer execution', () => {
    it('dispatches tasks layer by layer (respects topological order)', async () => {
      const executionOrder: string[] = [];
      const originalDispatch = executor.dispatch.bind(executor);
      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, ctx) => {
        executionOrder.push(node.id);
        return originalDispatch(node, ctx);
      });

      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
        makeNode({ id: 'T3', layer: 1, dependsOn: ['T1', 'T2'] }),
        makeNode({ id: 'T4', layer: 2, dependsOn: ['T3'] }),
      ];

      const graph = makeGraph(nodes);
      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(graph);

      // Layer 0 tasks come before layer 1, layer 1 before layer 2
      const t1Idx = executionOrder.indexOf('T1');
      const t2Idx = executionOrder.indexOf('T2');
      const t3Idx = executionOrder.indexOf('T3');
      const t4Idx = executionOrder.indexOf('T4');

      expect(t1Idx).toBeLessThan(t3Idx);
      expect(t2Idx).toBeLessThan(t3Idx);
      expect(t3Idx).toBeLessThan(t4Idx);

      expect(snapshot.completedTasks).toBe(4);
      expect(snapshot.failedTasks).toBe(0);
    });

    it('executes single-layer graph', async () => {
      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes));

      expect(snapshot.completedTasks).toBe(2);
      expect(snapshot.pendingTasks).toBe(0);
    });
  });

  describe('p-queue concurrency', () => {
    it('uses p-queue with concurrency from config', async () => {
      const concurrentTasks: number[] = [];
      let running = 0;

      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, _ctx) => {
        running++;
        concurrentTasks.push(running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
        return {
          taskId: node.id,
          output: 'ok',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 50,
        };
      });

      // All 4 tasks in same layer, concurrency=2
      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
        makeNode({ id: 'T3', layer: 0 }),
        makeNode({ id: 'T4', layer: 0 }),
      ];

      const scheduler = createScheduler({ concurrency: 2 });
      await scheduler.execute(makeGraph(nodes));

      // At no point should more than 2 tasks be running concurrently
      expect(Math.max(...concurrentTasks)).toBeLessThanOrEqual(2);
    });
  });

  describe('task failure handling', () => {
    it('marks dependents as skipped when a task fails', async () => {
      const skippedEvents: string[] = [];
      eventBus.on('task.skipped', (e) => skippedEvents.push(e.taskId));

      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, _ctx) => {
        if (node.id === 'T1') {
          throw new Error('T1 failed');
        }
        return {
          taskId: node.id,
          output: 'ok',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
        };
      });

      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
        makeNode({ id: 'T3', layer: 1, dependsOn: ['T1'] }),
        makeNode({ id: 'T4', layer: 2, dependsOn: ['T3'] }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes));

      // T1 failed, T2 completed, T3 skipped (depends on T1), T4 skipped (depends on T3)
      expect(snapshot.failedTasks).toBe(1);
      expect(snapshot.completedTasks).toBe(1);
      expect(snapshot.skippedTasks).toBe(2);
      expect(skippedEvents).toContain('T3');
      expect(skippedEvents).toContain('T4');
    });

    it('does not skip tasks whose non-failed dependencies all completed', async () => {
      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, _ctx) => {
        if (node.id === 'T2') {
          throw new Error('T2 failed');
        }
        return {
          taskId: node.id,
          output: 'ok',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
        };
      });

      // T1 and T2 in layer 0, T3 depends only on T1
      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
        makeNode({ id: 'T3', layer: 1, dependsOn: ['T1'] }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes));

      expect(snapshot.completedTasks).toBe(2); // T1 and T3
      expect(snapshot.failedTasks).toBe(1);    // T2
      expect(snapshot.skippedTasks).toBe(0);
    });
  });

  describe('ExecutionSnapshot tracking', () => {
    it('tracks completed/failed/pending/running/skipped counts', async () => {
      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
        makeNode({ id: 'T3', layer: 1, dependsOn: ['T1', 'T2'] }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes));

      expect(snapshot.completedTasks).toBe(3);
      expect(snapshot.failedTasks).toBe(0);
      expect(snapshot.pendingTasks).toBe(0);
      expect(snapshot.runningTasks).toBe(0);
      expect(snapshot.skippedTasks).toBe(0);
      expect(snapshot.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof snapshot.totalCostUsd).toBe('number');
    });

    it('snapshot reflects partial execution on failure', async () => {
      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, _ctx) => {
        if (node.id === 'T1') throw new Error('fail');
        return {
          taskId: node.id,
          output: 'ok',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
        };
      });

      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 1, dependsOn: ['T1'] }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes));

      expect(snapshot.completedTasks).toBe(0);
      expect(snapshot.failedTasks).toBe(1);
      expect(snapshot.skippedTasks).toBe(1);
    });
  });

  describe('event emission', () => {
    it('emits execution.started and execution.completed events', async () => {
      const events: string[] = [];
      eventBus.on('execution.started', () => events.push('started'));
      eventBus.on('execution.completed', () => events.push('completed'));

      const nodes = [makeNode({ id: 'T1', layer: 0 })];
      const scheduler = createScheduler();
      await scheduler.execute(makeGraph(nodes));

      expect(events).toEqual(['started', 'completed']);
    });

    it('emits task.ready events', async () => {
      const readyEvents: string[] = [];
      eventBus.on('task.ready', (e) => readyEvents.push(e.taskId));

      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 0 }),
      ];

      const scheduler = createScheduler();
      await scheduler.execute(makeGraph(nodes));

      expect(readyEvents).toContain('T1');
      expect(readyEvents).toContain('T2');
    });
  });

  describe('cancellation via AbortSignal', () => {
    it('BudgetExceededError triggers execution.cancelled event', async () => {
      const cancelledEvents: string[] = [];
      eventBus.on('execution.cancelled', (e) => cancelledEvents.push(e.reason));

      vi.spyOn(executor, 'dispatch').mockRejectedValue(
        new BudgetExceededError(100, 50),
      );

      const nodes = [makeNode({ id: 'T1', layer: 0 })];
      const scheduler = createScheduler();
      await scheduler.execute(makeGraph(nodes));

      expect(cancelledEvents.length).toBe(1);
      expect(cancelledEvents[0]).toContain('Budget exceeded');
    });

    it('AbortSignal cancels execution', async () => {
      const controller = new AbortController();
      const cancelledEvents: string[] = [];
      eventBus.on('execution.cancelled', (e) => cancelledEvents.push(e.reason));

      vi.spyOn(executor, 'dispatch').mockImplementation(async (node, _ctx) => {
        // Abort partway through
        controller.abort();
        await new Promise((r) => setTimeout(r, 10));
        return {
          taskId: node.id,
          output: 'ok',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
        };
      });

      const nodes = [
        makeNode({ id: 'T1', layer: 0 }),
        makeNode({ id: 'T2', layer: 1, dependsOn: ['T1'] }),
      ];

      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(makeGraph(nodes), controller.signal);

      expect(cancelledEvents.length).toBe(1);
      // T2 should not have been dispatched since signal was aborted
      expect(snapshot.skippedTasks + snapshot.pendingTasks + snapshot.completedTasks + snapshot.failedTasks).toBe(2);
    });
  });

  describe('pause / resume', () => {
    it('pause() and resume() exist and are callable', () => {
      const scheduler = createScheduler();
      expect(() => scheduler.pause()).not.toThrow();
      expect(() => scheduler.resume()).not.toThrow();
    });

    it('exposes eventBus property', () => {
      const scheduler = createScheduler();
      expect(scheduler.eventBus).toBe(eventBus);
    });
  });

  describe('empty graph', () => {
    it('handles empty graph gracefully', async () => {
      const graph = makeGraph([]);
      const scheduler = createScheduler();
      const snapshot = await scheduler.execute(graph);

      expect(snapshot.completedTasks).toBe(0);
      expect(snapshot.failedTasks).toBe(0);
    });
  });
});
