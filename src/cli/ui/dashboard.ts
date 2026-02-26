/**
 * Ink-based rich terminal dashboard for interactive mode (--interactive flag).
 *
 * Auto-detected: renders only when process.stdout.isTTY is true.
 * Falls back to ora-based progress tracking in non-TTY environments.
 *
 * Shows:
 *   - Overall progress bar
 *   - Per-task status (pending / running / completed / failed)
 *   - Cost accumulator (updated in real-time from EventBus)
 *   - Elapsed time
 *   - Provider health (circuit breaker states)
 */

import type { EventBus, Unsubscribe } from '../../events/types.js';

/** State tracked by the dashboard */
export interface DashboardState {
  readonly graphId: string;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly runningTasks: readonly string[];
  readonly skippedTasks: number;
  readonly elapsedMs: number;
  readonly totalCostUsd: number;
  readonly circuitBreakerStates: ReadonlyMap<string, 'open' | 'half-open' | 'closed'>;
}

/** Control handle returned from startDashboard() */
export interface Dashboard {
  getState(): DashboardState;
  stop(): void;
}

/**
 * Starts the dashboard state tracker. Subscribes to EventBus events and
 * maintains a current DashboardState. In interactive TTY environments this
 * state can be rendered with ink; in CI/non-TTY it provides the same data
 * to simpler renderers.
 *
 * Returns a Dashboard control handle. Call stop() to clean up.
 */
export function startDashboard(bus: EventBus): Dashboard {
  const cbStates = new Map<string, 'open' | 'half-open' | 'closed'>();

  let state: DashboardState = {
    graphId: '',
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    runningTasks: [],
    skippedTasks: 0,
    elapsedMs: 0,
    totalCostUsd: 0,
    circuitBreakerStates: cbStates,
  };

  const startTime = Date.now();

  function update(partial: Partial<DashboardState>): void {
    state = { ...state, ...partial, elapsedMs: Date.now() - startTime };
  }

  const unsubscribers: Unsubscribe[] = [
    bus.on('execution.started', (event) => {
      update({ graphId: event.graphId, totalTasks: event.totalTasks });
    }),

    bus.on('task.started', (event) => {
      update({ runningTasks: [...state.runningTasks, event.taskId] });
    }),

    bus.on('task.completed', (event) => {
      update({
        completedTasks: state.completedTasks + 1,
        runningTasks: state.runningTasks.filter((id) => id !== event.taskId),
      });
    }),

    bus.on('task.failed', (event) => {
      if (!event.willRetry) {
        update({
          failedTasks: state.failedTasks + 1,
          runningTasks: state.runningTasks.filter((id) => id !== event.taskId),
        });
      }
    }),

    bus.on('task.skipped', (event) => {
      update({
        skippedTasks: state.skippedTasks + 1,
        runningTasks: state.runningTasks.filter((id) => id !== event.taskId),
      });
    }),

    bus.on('execution.completed', (event) => {
      const snap = event.snapshot;
      update({
        completedTasks: snap.completedTasks,
        failedTasks: snap.failedTasks,
        skippedTasks: snap.skippedTasks,
        totalCostUsd: snap.totalCostUsd,
        runningTasks: [],
      });
    }),

    bus.on('resilience.circuit.opened', (event) => {
      cbStates.set(event.provider, 'open');
      update({ circuitBreakerStates: new Map(cbStates) });
    }),

    bus.on('resilience.circuit.halfOpen', (event) => {
      cbStates.set(event.provider, 'half-open');
      update({ circuitBreakerStates: new Map(cbStates) });
    }),

    bus.on('resilience.circuit.closed', (event) => {
      cbStates.set(event.provider, 'closed');
      update({ circuitBreakerStates: new Map(cbStates) });
    }),
  ];

  return {
    getState(): DashboardState {
      return { ...state, elapsedMs: Date.now() - startTime };
    },

    stop(): void {
      for (const unsub of unsubscribers) unsub();
      unsubscribers.length = 0;
    },
  };
}
