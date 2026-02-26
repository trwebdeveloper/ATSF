import type { TaskId } from '../../shared/types.js';

/**
 * File access mode for lock management.
 */
export type FileAccessMode = 'read' | 'write';

/**
 * Represents a file access request with pattern and mode.
 */
export interface FileAccess {
  readonly pattern: string;
  readonly mode: FileAccessMode;
}

/**
 * Configuration for the FileLockManager.
 */
export interface FileLockManagerConfig {
  readonly lockTtlMs: number;
  readonly reapIntervalMs: number;
}

/**
 * A held lock entry with metadata for TTL-based expiration.
 */
interface LockEntry {
  readonly taskId: TaskId;
  readonly mode: FileAccessMode;
  readonly acquiredAt: number;
}

/**
 * A queued acquisition request waiting in the FIFO queue.
 */
interface QueuedRequest {
  readonly taskId: TaskId;
  readonly files: readonly FileAccess[];
  readonly resolve: (value: boolean) => void;
}

/**
 * In-memory file lock manager (~150 LOC).
 * Uses bulk acquire (all-or-wait) to prevent deadlocks.
 * FIFO fairness queue prevents starvation.
 * TTL-based expiration handles crash recovery.
 *
 * Source: In-memory file lock manager (Section 9.3);
 * dag-events-resilience correction Section 1.7.
 */
export class FileLockManager {
  /** Map from file pattern to active lock entries. */
  private readonly _locks = new Map<string, LockEntry[]>();

  /** Set of files held by each task. */
  private readonly _taskFiles = new Map<TaskId, FileAccess[]>();

  /** FIFO queue of waiting acquisition requests. */
  private readonly _queue: QueuedRequest[] = [];

  private readonly _config: FileLockManagerConfig;

  constructor(config: FileLockManagerConfig) {
    this._config = config;
  }

  /**
   * Get the current FIFO queue depth (tasks waiting for locks).
   */
  get queueDepth(): number {
    return this._queue.length;
  }

  /**
   * Attempt to acquire all locks for a task atomically.
   * Returns a Promise that resolves to true when all locks are acquired.
   * All-or-nothing: never partially acquires.
   * Tasks are served in FIFO order to prevent starvation.
   */
  acquire(taskId: TaskId, files: readonly FileAccess[]): Promise<boolean> {
    // Empty file list — immediate success
    if (files.length === 0) {
      return Promise.resolve(true);
    }

    // If all requested locks are currently free, acquire immediately.
    // FIFO ordering only applies when a lock becomes free via release().
    if (this._canAcquireAll(files)) {
      this._doAcquire(taskId, files);
      return Promise.resolve(true);
    }

    // Locks unavailable — enqueue in FIFO queue and wait
    return new Promise<boolean>((resolve) => {
      this._queue.push({ taskId, files, resolve });
    });
  }

  /**
   * Release all locks held by a task and process the FIFO queue.
   */
  release(taskId: TaskId): void {
    const files = this._taskFiles.get(taskId);
    if (!files) return;

    // Remove lock entries for this task
    for (const file of files) {
      const entries = this._locks.get(file.pattern);
      if (entries) {
        const filtered = entries.filter((e) => e.taskId !== taskId);
        if (filtered.length === 0) {
          this._locks.delete(file.pattern);
        } else {
          this._locks.set(file.pattern, filtered);
        }
      }
    }

    this._taskFiles.delete(taskId);

    // Process FIFO queue — grant locks to the first queued task whose locks are free
    this._processQueue();
  }

  /**
   * Check if a task's files are available (without acquiring).
   */
  canAcquire(_taskId: TaskId, files: readonly FileAccess[]): boolean {
    return this._canAcquireAll(files);
  }

  /**
   * Force-release locks held longer than TTL.
   * Returns array of task IDs whose locks were force-released.
   */
  expireStale(ttlMs: number): TaskId[] {
    const now = Date.now();
    const expiredTaskIds: TaskId[] = [];

    for (const [taskId, files] of this._taskFiles.entries()) {
      // Check if any lock held by this task is stale
      let isStale = false;
      for (const file of files) {
        const entries = this._locks.get(file.pattern);
        if (entries) {
          for (const entry of entries) {
            if (entry.taskId === taskId && (now - entry.acquiredAt) > ttlMs) {
              isStale = true;
              break;
            }
          }
        }
        if (isStale) break;
      }

      if (isStale) {
        expiredTaskIds.push(taskId);
      }
    }

    // Release all stale tasks
    for (const taskId of expiredTaskIds) {
      this.release(taskId);
    }

    return expiredTaskIds;
  }

  /**
   * Check if all files in the request can be acquired without conflict.
   */
  private _canAcquireAll(files: readonly FileAccess[]): boolean {
    for (const file of files) {
      if (!this._isAvailable(file)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a single file access is available.
   * Read-read is allowed. Write conflicts with any existing lock.
   */
  private _isAvailable(file: FileAccess): boolean {
    const entries = this._locks.get(file.pattern);
    if (!entries || entries.length === 0) return true;

    if (file.mode === 'write') {
      // Write conflicts with any existing lock (read or write)
      return false;
    }

    // Read mode — conflicts only with existing write locks
    return entries.every((e) => e.mode === 'read');
  }

  /**
   * Actually acquire all locks for a task (caller must have verified availability).
   */
  private _doAcquire(taskId: TaskId, files: readonly FileAccess[]): void {
    const now = Date.now();
    const fileList: FileAccess[] = [];

    for (const file of files) {
      const entry: LockEntry = {
        taskId,
        mode: file.mode,
        acquiredAt: now,
      };

      const existing = this._locks.get(file.pattern);
      if (existing) {
        this._locks.set(file.pattern, [...existing, entry]);
      } else {
        this._locks.set(file.pattern, [entry]);
      }

      fileList.push(file);
    }

    this._taskFiles.set(taskId, fileList);
  }

  /**
   * Process the FIFO queue: scan front-to-back, grant the first task whose locks are free.
   */
  private _processQueue(): void {
    for (let i = 0; i < this._queue.length; i++) {
      const request = this._queue[i];
      if (this._canAcquireAll(request.files)) {
        // Remove from queue
        this._queue.splice(i, 1);
        // Acquire locks
        this._doAcquire(request.taskId, request.files);
        // Resolve the promise
        request.resolve(true);
        // Only grant one task per release to maintain FIFO ordering
        // Then recursively process in case more can proceed
        this._processQueue();
        return;
      }
    }
  }
}
