import ora, { type Ora } from 'ora';
import type { EventBus, Unsubscribe } from '../../events/types.js';

/**
 * Public interface for the progress tracker.
 * Call stop() to clean up event subscriptions and spinners when done.
 */
export interface ProgressTracker {
  stop(): void;
}

/**
 * Internal state for tracking per-task spinner instances.
 */
interface TaskState {
  spinner: Ora;
  startedAt: number;
}

/**
 * Creates a ProgressTracker that subscribes to EventBus events and updates
 * ora spinners to reflect pipeline execution progress.
 *
 * In simple (non-TTY) mode, ora falls back to non-interactive output automatically.
 * The tracker handles: execution lifecycle, task lifecycle, and retry events.
 */
export function createProgressTracker(bus: EventBus): ProgressTracker {
  const taskSpinners = new Map<string, TaskState>();
  const unsubscribers: Unsubscribe[] = [];
  let executionSpinner: Ora | null = null;
  let totalTasks = 0;
  let completedTasks = 0;

  function formatCost(costUsd: number): string {
    return `$${costUsd.toFixed(4)}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // ─── Execution lifecycle ──────────────────────────────────────────

  const unsubExecutionStarted = bus.on('execution.started', (event) => {
    totalTasks = event.totalTasks;
    completedTasks = 0;
    executionSpinner = ora(`Starting pipeline: ${totalTasks} tasks`).start();
  });
  unsubscribers.push(unsubExecutionStarted);

  const unsubExecutionCompleted = bus.on('execution.completed', (event) => {
    // Stop the main execution spinner
    if (executionSpinner) {
      const { success, durationMs, snapshot } = event;
      const costStr = formatCost(snapshot.totalCostUsd);
      const durationStr = formatDuration(durationMs);
      if (success) {
        executionSpinner.succeed(
          `Pipeline completed: ${snapshot.completedTasks}/${totalTasks} tasks in ${durationStr} (cost: ${costStr})`,
        );
      } else {
        executionSpinner.fail(
          `Pipeline finished with errors: ${snapshot.failedTasks} failed, cost: ${costStr}`,
        );
      }
      executionSpinner = null;
    }

    // Stop any remaining task spinners
    for (const [taskId, state] of taskSpinners.entries()) {
      state.spinner.stop();
      taskSpinners.delete(taskId);
    }
  });
  unsubscribers.push(unsubExecutionCompleted);

  const unsubExecutionCancelled = bus.on('execution.cancelled', (event) => {
    if (executionSpinner) {
      executionSpinner.fail(`Pipeline cancelled: ${event.reason}`);
      executionSpinner = null;
    }
    for (const [taskId, state] of taskSpinners.entries()) {
      state.spinner.stop();
      taskSpinners.delete(taskId);
    }
  });
  unsubscribers.push(unsubExecutionCancelled);

  // ─── Task lifecycle ───────────────────────────────────────────────

  const unsubTaskStarted = bus.on('task.started', (event) => {
    const { taskId, agent, attempt } = event;
    const label = attempt > 1
      ? `[${taskId}] Running via ${agent} (attempt ${attempt})`
      : `[${taskId}] Running via ${agent}`;

    // Update overall execution spinner
    if (executionSpinner) {
      executionSpinner.text = `${completedTasks}/${totalTasks} tasks — ${label}`;
    }

    // Create per-task spinner
    const spinner = ora({ text: label, indent: 2 }).start();
    taskSpinners.set(taskId, { spinner, startedAt: Date.now() });
  });
  unsubscribers.push(unsubTaskStarted);

  const unsubTaskCompleted = bus.on('task.completed', (event) => {
    const { taskId, durationMs, tokenUsage } = event;
    completedTasks++;

    const state = taskSpinners.get(taskId);
    if (state) {
      const tokensStr = tokenUsage
        ? ` (${tokenUsage.totalTokens} tokens)`
        : '';
      state.spinner.succeed(
        `[${taskId}] Completed in ${formatDuration(durationMs)}${tokensStr}`,
      );
      taskSpinners.delete(taskId);
    }

    if (executionSpinner) {
      executionSpinner.text = `${completedTasks}/${totalTasks} tasks completed`;
    }
  });
  unsubscribers.push(unsubTaskCompleted);

  const unsubTaskFailed = bus.on('task.failed', (event) => {
    const { taskId, error, willRetry } = event;

    const state = taskSpinners.get(taskId);
    if (state) {
      if (willRetry) {
        state.spinner.warn(`[${taskId}] Failed (will retry): ${error}`);
      } else {
        state.spinner.fail(`[${taskId}] Failed: ${error}`);
        taskSpinners.delete(taskId);
      }
    }
  });
  unsubscribers.push(unsubTaskFailed);

  const unsubTaskRetrying = bus.on('task.retrying', (event) => {
    const { taskId, attempt, maxAttempts, delayMs } = event;

    const state = taskSpinners.get(taskId);
    if (state) {
      state.spinner.text = `[${taskId}] Retrying (${attempt}/${maxAttempts}) after ${formatDuration(delayMs)}...`;
    } else {
      // No existing spinner — create one for visibility
      const spinner = ora({
        text: `[${taskId}] Retrying (${attempt}/${maxAttempts})...`,
        indent: 2,
      }).start();
      taskSpinners.set(taskId, { spinner, startedAt: Date.now() });
    }
  });
  unsubscribers.push(unsubTaskRetrying);

  const unsubTaskSkipped = bus.on('task.skipped', (event) => {
    const { taskId, reason } = event;
    const state = taskSpinners.get(taskId);
    if (state) {
      state.spinner.warn(`[${taskId}] Skipped: ${reason}`);
      taskSpinners.delete(taskId);
    }
  });
  unsubscribers.push(unsubTaskSkipped);

  return {
    stop(): void {
      // Unsubscribe all event listeners
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;

      // Stop any active spinners
      if (executionSpinner) {
        executionSpinner.stop();
        executionSpinner = null;
      }
      for (const [taskId, state] of taskSpinners.entries()) {
        state.spinner.stop();
        taskSpinners.delete(taskId);
      }
    },
  };
}
