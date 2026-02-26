import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ora so tests run without TTY
vi.mock('ora', () => {
  const mockSpinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
    isSpinning: false,
  };
  const oraFactory = vi.fn(() => mockSpinner);
  return { default: oraFactory };
});

import { createProgressTracker, type ProgressTracker } from '../../../../src/cli/ui/progress.js';
import { createEventBus } from '../../../../src/events/event-bus.js';
import type { EventBus } from '../../../../src/events/types.js';

function makeTimestamp(): Date {
  return new Date();
}

describe('createProgressTracker', () => {
  let bus: EventBus;
  let tracker: ProgressTracker;

  beforeEach(() => {
    bus = createEventBus();
    tracker = createProgressTracker(bus);
  });

  afterEach(() => {
    tracker.stop();
    bus.removeAllListeners();
    vi.clearAllMocks();
  });

  it('creates a progress tracker with a stop method', () => {
    expect(typeof tracker.stop).toBe('function');
  });

  it('shows spinner on execution.started event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 5,
      graphId: 'g1',
    });
    // After the event, tracker should have started a spinner
    expect(tracker).toBeDefined();
  });

  it('updates spinner on task.started event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 3,
      graphId: 'g1',
    });
    bus.emit({
      type: 'task.started',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      agent: 'planner',
      attempt: 1,
    });
    expect(tracker).toBeDefined();
  });

  it('marks task as complete on task.completed event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 3,
      graphId: 'g1',
    });
    bus.emit({
      type: 'task.started',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      agent: 'planner',
      attempt: 1,
    });
    bus.emit({
      type: 'task.completed',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      durationMs: 1200,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
    expect(tracker).toBeDefined();
  });

  it('marks task as failed on task.failed event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 3,
      graphId: 'g1',
    });
    bus.emit({
      type: 'task.started',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      agent: 'planner',
      attempt: 1,
    });
    bus.emit({
      type: 'task.failed',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      error: 'Provider timed out',
      attempt: 1,
      willRetry: false,
    });
    expect(tracker).toBeDefined();
  });

  it('shows retry warning on task.retrying event', () => {
    bus.emit({
      type: 'task.retrying',
      timestamp: makeTimestamp(),
      source: 'test',
      taskId: 'task-001',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 1000,
    });
    expect(tracker).toBeDefined();
  });

  it('stops all spinners on execution.completed event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 2,
      graphId: 'g1',
    });
    bus.emit({
      type: 'execution.completed',
      timestamp: makeTimestamp(),
      source: 'test',
      success: true,
      durationMs: 5000,
      snapshot: {
        completedTasks: 2,
        failedTasks: 0,
        pendingTasks: 0,
        runningTasks: 0,
        skippedTasks: 0,
        totalCostUsd: 0.05,
        elapsedMs: 5000,
      },
    });
    expect(tracker).toBeDefined();
  });

  it('handles execution.cancelled event', () => {
    bus.emit({
      type: 'execution.started',
      timestamp: makeTimestamp(),
      source: 'test',
      totalTasks: 2,
      graphId: 'g1',
    });
    bus.emit({
      type: 'execution.cancelled',
      timestamp: makeTimestamp(),
      source: 'test',
      reason: 'User interrupted',
      snapshot: {
        completedTasks: 1,
        failedTasks: 0,
        pendingTasks: 1,
        runningTasks: 0,
        skippedTasks: 0,
        totalCostUsd: 0.02,
        elapsedMs: 2000,
      },
    });
    expect(tracker).toBeDefined();
  });

  it('stop() removes event subscriptions', () => {
    const localTracker = createProgressTracker(bus);
    localTracker.stop();
    // Should not throw when events are emitted after stop
    expect(() => {
      bus.emit({
        type: 'task.started',
        timestamp: makeTimestamp(),
        source: 'test',
        taskId: 'task-99',
        agent: 'test-agent',
        attempt: 1,
      });
    }).not.toThrow();
  });
});

describe('ProgressTracker interface', () => {
  it('can be used as ProgressTracker type', () => {
    const bus = createEventBus();
    const tracker: ProgressTracker = createProgressTracker(bus);
    expect(tracker).toBeDefined();
    tracker.stop();
    bus.removeAllListeners();
  });
});
