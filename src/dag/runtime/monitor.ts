import type { ExecutionSnapshot, TaskId } from '../../shared/types.js';

/**
 * Task execution state for tracking.
 */
export type TaskState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * ExecutionMonitor tracks the state of all tasks during DAG execution
 * and produces ExecutionSnapshot on demand.
 */
export class ExecutionMonitor {
  private readonly _taskStates = new Map<TaskId, TaskState>();
  private readonly _startTime: number;
  private _totalCostUsd = 0;

  constructor() {
    this._startTime = Date.now();
  }

  /**
   * Register a task as pending at the start of execution.
   */
  registerTask(taskId: TaskId): void {
    this._taskStates.set(taskId, 'pending');
  }

  /**
   * Mark a task as running.
   */
  markRunning(taskId: TaskId): void {
    this._taskStates.set(taskId, 'running');
  }

  /**
   * Mark a task as completed.
   */
  markCompleted(taskId: TaskId): void {
    this._taskStates.set(taskId, 'completed');
  }

  /**
   * Mark a task as failed.
   */
  markFailed(taskId: TaskId): void {
    this._taskStates.set(taskId, 'failed');
  }

  /**
   * Mark a task as skipped (due to upstream failure).
   */
  markSkipped(taskId: TaskId): void {
    this._taskStates.set(taskId, 'skipped');
  }

  /**
   * Get the current state of a task.
   */
  getState(taskId: TaskId): TaskState | undefined {
    return this._taskStates.get(taskId);
  }

  /**
   * Add cost to the running total.
   */
  addCost(costUsd: number): void {
    this._totalCostUsd += costUsd;
  }

  /**
   * Get a snapshot of the current execution state.
   */
  getSnapshot(): ExecutionSnapshot {
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let running = 0;
    let skipped = 0;

    for (const state of this._taskStates.values()) {
      switch (state) {
        case 'completed': completed++; break;
        case 'failed': failed++; break;
        case 'pending': pending++; break;
        case 'running': running++; break;
        case 'skipped': skipped++; break;
      }
    }

    return {
      completedTasks: completed,
      failedTasks: failed,
      pendingTasks: pending,
      runningTasks: running,
      skippedTasks: skipped,
      totalCostUsd: this._totalCostUsd,
      elapsedMs: Date.now() - this._startTime,
    };
  }
}
