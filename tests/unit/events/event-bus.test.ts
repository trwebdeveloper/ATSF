import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/events/event-bus.js';
import type { ATSFEvent, ATSFEventType } from '../../../src/events/types.js';
import type { EventBus } from '../../../src/events/types.js';

function makeEvent<T extends ATSFEventType>(type: T, extra: Record<string, unknown> = {}): ATSFEvent {
  return { type, timestamp: new Date(), source: 'test', ...extra } as ATSFEvent;
}

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  it('emits events to registered listeners', () => {
    const listener = vi.fn();
    bus.on('execution.started', listener);

    const event = makeEvent('execution.started', { totalTasks: 5, graphId: 'g1' });
    bus.emit(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('does not propagate listener errors', () => {
    const badListener = vi.fn(() => { throw new Error('boom'); });
    const goodListener = vi.fn();

    bus.on('task.completed', badListener);
    bus.on('task.completed', goodListener);

    const event = makeEvent('task.completed', { taskId: 't1', durationMs: 100 });

    // Should not throw
    expect(() => bus.emit(event)).not.toThrow();
    expect(badListener).toHaveBeenCalledOnce();
    expect(goodListener).toHaveBeenCalledOnce();
  });

  it('supports multiple listeners per event type', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    bus.on('task.started', listener1);
    bus.on('task.started', listener2);
    bus.on('task.started', listener3);

    const event = makeEvent('task.started', { taskId: 't1', agent: 'planner', attempt: 1 });
    bus.emit(event);

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
    expect(listener3).toHaveBeenCalledOnce();
  });

  it('unsubscribe works correctly', () => {
    const listener = vi.fn();
    const unsub = bus.on('task.failed', listener);

    const event = makeEvent('task.failed', { taskId: 't1', error: 'err', attempt: 1, willRetry: false });
    bus.emit(event);
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    bus.emit(event);
    expect(listener).toHaveBeenCalledOnce(); // Still 1, not called again
  });

  it('once() fires only once', () => {
    const listener = vi.fn();
    bus.once('execution.completed', listener);

    const event = makeEvent('execution.completed', {
      success: true,
      snapshot: { completedTasks: 1, failedTasks: 0, pendingTasks: 0, runningTasks: 0, skippedTasks: 0, totalCostUsd: 0, elapsedMs: 100 },
      durationMs: 100,
    });

    bus.emit(event);
    bus.emit(event);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('removeAllListeners clears everything', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    bus.on('task.ready', listener1);
    bus.on('task.completed', listener2);

    bus.removeAllListeners();

    bus.emit(makeEvent('task.ready', { taskId: 't1', layer: 0 }));
    bus.emit(makeEvent('task.completed', { taskId: 't1', durationMs: 50 }));

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('emitting event with no listeners does not throw', () => {
    expect(() => bus.emit(makeEvent('execution.paused'))).not.toThrow();
  });

  it('listeners for different event types are independent', () => {
    const startedListener = vi.fn();
    const completedListener = vi.fn();

    bus.on('task.started', startedListener);
    bus.on('task.completed', completedListener);

    bus.emit(makeEvent('task.started', { taskId: 't1', agent: 'builder', attempt: 1 }));

    expect(startedListener).toHaveBeenCalledOnce();
    expect(completedListener).not.toHaveBeenCalled();
  });

  describe('all 22 event types can be emitted and received', () => {
    const eventPayloads: Record<string, Record<string, unknown>> = {
      'execution.started': { totalTasks: 5, graphId: 'g1' },
      'execution.completed': { success: true, snapshot: { completedTasks: 5, failedTasks: 0, pendingTasks: 0, runningTasks: 0, skippedTasks: 0, totalCostUsd: 1.0, elapsedMs: 5000 }, durationMs: 5000 },
      'execution.cancelled': { reason: 'user', snapshot: { completedTasks: 2, failedTasks: 0, pendingTasks: 3, runningTasks: 0, skippedTasks: 0, totalCostUsd: 0.5, elapsedMs: 2000 } },
      'execution.paused': {},
      'execution.resumed': {},
      'task.ready': { taskId: 't1', layer: 0 },
      'task.started': { taskId: 't1', agent: 'planner', attempt: 1 },
      'task.completed': { taskId: 't1', durationMs: 100 },
      'task.failed': { taskId: 't1', error: 'timeout', attempt: 1, willRetry: true },
      'task.retrying': { taskId: 't1', attempt: 2, maxAttempts: 3, delayMs: 1000 },
      'task.skipped': { taskId: 't2', reason: 'upstream failed', failedUpstream: 't1' },
      'resilience.circuit.opened': { provider: 'openrouter', failureCount: 5, cooldownMs: 30000 },
      'resilience.circuit.halfOpen': { provider: 'openrouter' },
      'resilience.circuit.closed': { provider: 'openrouter' },
      'resilience.concurrency.adjusted': { previous: 4, current: 2, reason: 'rate limit' },
      'resilience.rateLimited': { provider: 'openrouter', delayMs: 5000 },
      'debate.started': { topic: 'architecture', proposerCount: 3 },
      'debate.round.completed': { roundNumber: 1, convergenceScore: 0.7 },
      'debate.decision.made': { decisionId: 'd1', convergenceAchieved: true },
      'escalation.created': { issueId: 'ISS-001', taskId: 't1', category: 'ambiguity', severity: 'high' },
      'escalation.resolved': { issueId: 'ISS-001', taskId: 't1', resolution: 'answered' as const },
      'task.blocked_on_human': { taskId: 't1', issueId: 'ISS-001', reason: 'need clarification' },
    };

    for (const [eventType, payload] of Object.entries(eventPayloads)) {
      it(`handles ${eventType}`, () => {
        const listener = vi.fn();
        bus.on(eventType as ATSFEventType, listener);

        const event = makeEvent(eventType as ATSFEventType, payload);
        bus.emit(event);

        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith(event);
      });
    }
  });
});

describe('extractTokenUsage', () => {
  it('extracts usage field from GenerateResponse', async () => {
    const { extractTokenUsage } = await import('../../../src/providers/types.js');
    const response = {
      content: 'hello',
      model: 'gpt-4',
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };

    const usage = extractTokenUsage(response);
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  });
});
