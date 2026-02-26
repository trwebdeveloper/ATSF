/**
 * Cross-reference resolver for ATSF artifacts.
 *
 * Resolves references between tasks, files, and artifacts
 * to enrich query results with related context.
 */

import type { IndexedChunk } from '../schemas.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface CrossRefEntry {
  readonly taskId: string;
  readonly filesWrite: readonly string[];
  readonly filesRead: readonly string[];
  readonly dependsOn: readonly string[];
}

// ─── CrossRefResolver ────────────────────────────────────────────────

export class CrossRefResolver {
  private _taskRefs: Map<string, CrossRefEntry>;
  private _fileToTasks: Map<string, Set<string>>;

  constructor() {
    this._taskRefs = new Map();
    this._fileToTasks = new Map();
  }

  /**
   * Register a task's cross-reference data.
   */
  addTask(entry: CrossRefEntry): void {
    this._taskRefs.set(entry.taskId, entry);

    for (const file of entry.filesWrite) {
      if (!this._fileToTasks.has(file)) {
        this._fileToTasks.set(file, new Set());
      }
      this._fileToTasks.get(file)!.add(entry.taskId);
    }

    for (const file of entry.filesRead) {
      if (!this._fileToTasks.has(file)) {
        this._fileToTasks.set(file, new Set());
      }
      this._fileToTasks.get(file)!.add(entry.taskId);
    }
  }

  /**
   * Find tasks related to a given task (via dependencies and shared files).
   */
  getRelatedTasks(taskId: string): string[] {
    const related = new Set<string>();
    const entry = this._taskRefs.get(taskId);
    if (!entry) return [];

    // Direct dependencies
    for (const dep of entry.dependsOn) {
      related.add(dep);
    }

    // Tasks that depend on this task
    for (const [id, ref] of this._taskRefs) {
      if (id !== taskId && ref.dependsOn.includes(taskId)) {
        related.add(id);
      }
    }

    // Tasks sharing files
    for (const file of [...entry.filesWrite, ...entry.filesRead]) {
      const tasks = this._fileToTasks.get(file);
      if (tasks) {
        for (const t of tasks) {
          if (t !== taskId) related.add(t);
        }
      }
    }

    return [...related].sort();
  }

  /**
   * Find tasks related to any task mentioned in a set of chunks.
   */
  getRelatedTasksFromChunks(chunks: readonly IndexedChunk[]): string[] {
    const taskIds = new Set<string>();
    for (const chunk of chunks) {
      for (const tid of chunk.taskIds) {
        taskIds.add(tid);
      }
    }

    const related = new Set<string>();
    for (const tid of taskIds) {
      for (const r of this.getRelatedTasks(tid)) {
        related.add(r);
      }
      // Include the original task IDs too
      related.add(tid);
    }

    return [...related].sort();
  }

  /**
   * Get upstream tasks (tasks this task depends on, transitively).
   * Used for root cause analysis.
   */
  getUpstreamTasks(taskId: string): string[] {
    const upstream = new Set<string>();
    const queue = [taskId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const entry = this._taskRefs.get(current);
      if (!entry) continue;

      for (const dep of entry.dependsOn) {
        upstream.add(dep);
        queue.push(dep);
      }
    }

    return [...upstream].sort();
  }

  /**
   * Find tasks that overlap with a given file path (via filesWrite/filesRead).
   */
  getTasksForFile(filePath: string): string[] {
    const tasks = this._fileToTasks.get(filePath);
    return tasks ? [...tasks].sort() : [];
  }

  /**
   * Get a task reference by ID.
   */
  getTask(taskId: string): CrossRefEntry | undefined {
    return this._taskRefs.get(taskId);
  }

  /**
   * Get all registered task IDs.
   */
  getAllTaskIds(): string[] {
    return [...this._taskRefs.keys()].sort();
  }

  /**
   * Total number of registered tasks.
   */
  get size(): number {
    return this._taskRefs.size;
  }
}
