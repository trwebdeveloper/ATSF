import PQueue from 'p-queue';
import type { TaskGraph, TaskNode } from '../../dag/types.js';
import type { ExecutionSnapshot, TaskId } from '../../shared/types.js';
import type { EventBus } from '../../events/types.js';
import type { ProviderRegistry } from '../../providers/types.js';
import type { ResilienceLayer } from '../../resilience/resilience-layer.js';
import { BudgetExceededError } from '../../shared/errors.js';
import type { FileLockManager } from './file-lock-manager.js';
import type { TaskExecutorImpl } from './executor.js';
import type { AgentDefinition, ExecutionContext } from './executor.js';
import { ExecutionMonitor } from './monitor.js';

/**
 * Configuration for the DAGScheduler.
 */
export interface DAGSchedulerConfig {
  readonly concurrency: number;
  readonly taskTimeoutMs: number;
  readonly throwOnTimeout: boolean;
}

/**
 * Constructor dependencies for the DAGScheduler.
 */
export interface DAGSchedulerDeps {
  readonly eventBus: EventBus;
  readonly resilience: ResilienceLayer;
  readonly fileLockManager: FileLockManager;
  readonly executor: TaskExecutorImpl;
  readonly providerRegistry: ProviderRegistry;
  readonly agentDefinitions: ReadonlyMap<string, AgentDefinition>;
  readonly config: DAGSchedulerConfig;
}

/**
 * Runtime DAG scheduler.
 * Consumes a validated TaskGraph and executes tasks respecting
 * dependency ordering, file lock constraints, and concurrency limits.
 *
 * Source: Parallel execution (Section 9);
 * dag-events-resilience correction Section 1.
 */
export class DAGSchedulerImpl {
  private readonly _eventBus: EventBus;
  private readonly _resilience: ResilienceLayer;
  private readonly _fileLockManager: FileLockManager;
  private readonly _executor: TaskExecutorImpl;
  private readonly _providerRegistry: ProviderRegistry;
  private readonly _agentDefinitions: ReadonlyMap<string, AgentDefinition>;
  private readonly _config: DAGSchedulerConfig;
  private _queue: PQueue | null = null;

  constructor(deps: DAGSchedulerDeps) {
    this._eventBus = deps.eventBus;
    this._resilience = deps.resilience;
    this._fileLockManager = deps.fileLockManager;
    this._executor = deps.executor;
    this._providerRegistry = deps.providerRegistry;
    this._agentDefinitions = deps.agentDefinitions;
    this._config = deps.config;
  }

  /** The event bus used for execution lifecycle events. */
  get eventBus(): EventBus {
    return this._eventBus;
  }

  /**
   * Execute all tasks in the graph, returning a final execution snapshot.
   * Tasks are dispatched layer-by-layer; within each layer, tasks run
   * concurrently subject to file lock and concurrency constraints.
   */
  async execute(graph: TaskGraph, signal?: AbortSignal): Promise<ExecutionSnapshot> {
    const monitor = new ExecutionMonitor();
    const failedTaskIds = new Set<TaskId>();

    // Register all tasks as pending
    for (const taskId of graph.nodes.keys()) {
      monitor.registerTask(taskId);
    }

    // Emit execution.started
    this._eventBus.emit({
      type: 'execution.started',
      totalTasks: graph.nodes.size,
      graphId: 'dag-execution',
      timestamp: new Date(),
      source: 'dag-scheduler',
    });

    // Create p-queue for concurrency control
    // Note: p-queue v9 always throws on timeout (no throwOnTimeout option)
    this._queue = new PQueue({
      concurrency: this._config.concurrency,
      timeout: this._config.taskTimeoutMs,
    });

    let cancelled = false;

    // Process layers sequentially
    for (const layer of graph.layers) {
      // Check for cancellation before each layer
      if (signal?.aborted || cancelled) {
        // Mark remaining pending tasks as skipped
        for (const taskId of layer.taskIds) {
          if (monitor.getState(taskId) === 'pending') {
            monitor.markSkipped(taskId);
          }
        }
        continue;
      }

      const layerPromises: Promise<void>[] = [];

      for (const taskId of layer.taskIds) {
        const node = graph.nodes.get(taskId);
        if (!node) continue;

        // Check if any dependency has failed -> skip this task
        if (this._hasFailedDependency(node, failedTaskIds)) {
          monitor.markSkipped(taskId);
          failedTaskIds.add(taskId); // Propagate skip for downstream tasks

          this._eventBus.emit({
            type: 'task.skipped',
            taskId,
            reason: 'Upstream dependency failed',
            failedUpstream: this._findFailedUpstream(node, failedTaskIds),
            timestamp: new Date(),
            source: 'dag-scheduler',
          });

          continue;
        }

        // Check cancellation again
        if (signal?.aborted || cancelled) {
          monitor.markSkipped(taskId);
          continue;
        }

        // Emit task.ready
        this._eventBus.emit({
          type: 'task.ready',
          taskId,
          layer: layer.depth,
          timestamp: new Date(),
          source: 'dag-scheduler',
        });

        // Add task to p-queue
        const taskPromise = this._queue.add(async () => {
          // Check cancellation before starting
          if (signal?.aborted || cancelled) {
            monitor.markSkipped(taskId);
            return;
          }

          monitor.markRunning(taskId);

          const context: ExecutionContext = {
            providerRegistry: this._providerRegistry,
            resilience: this._resilience,
            lockManager: this._fileLockManager,
            eventBus: this._eventBus,
            agentDefinitions: this._agentDefinitions,
            signal,
          };

          try {
            await this._executor.dispatch(node, context);
            monitor.markCompleted(taskId);
          } catch (err) {
            if (err instanceof BudgetExceededError) {
              monitor.markFailed(taskId);
              failedTaskIds.add(taskId);
              cancelled = true;

              this._eventBus.emit({
                type: 'execution.cancelled',
                reason: `Budget exceeded: $${err.currentCostUsd.toFixed(4)} > $${err.budgetLimitUsd.toFixed(4)}`,
                snapshot: monitor.getSnapshot(),
                timestamp: new Date(),
                source: 'dag-scheduler',
              });
              return;
            }

            monitor.markFailed(taskId);
            failedTaskIds.add(taskId);
          }
        }, { priority: node.priority ?? 0 });

        layerPromises.push(taskPromise as Promise<void>);
      }

      // Wait for all tasks in this layer to complete before moving to the next
      await Promise.all(layerPromises);
    }

    const snapshot = monitor.getSnapshot();

    // Emit final event
    if (cancelled || signal?.aborted) {
      if (!cancelled) {
        // Signal was aborted but we haven't emitted cancellation yet
        this._eventBus.emit({
          type: 'execution.cancelled',
          reason: 'Execution aborted via AbortSignal',
          snapshot,
          timestamp: new Date(),
          source: 'dag-scheduler',
        });
      }
    } else {
      this._eventBus.emit({
        type: 'execution.completed',
        success: snapshot.failedTasks === 0 && snapshot.skippedTasks === 0,
        snapshot,
        durationMs: snapshot.elapsedMs,
        timestamp: new Date(),
        source: 'dag-scheduler',
      });
    }

    return snapshot;
  }

  /** Pause task dispatch (in-flight tasks continue to completion). */
  pause(): void {
    if (this._queue) {
      this._queue.pause();
    }
    this._eventBus.emit({
      type: 'execution.paused',
      timestamp: new Date(),
      source: 'dag-scheduler',
    });
  }

  /** Resume task dispatch after a pause. */
  resume(): void {
    if (this._queue) {
      this._queue.start();
    }
    this._eventBus.emit({
      type: 'execution.resumed',
      timestamp: new Date(),
      source: 'dag-scheduler',
    });
  }

  /**
   * Check if any of a task's dependencies are in the failed set.
   */
  private _hasFailedDependency(node: TaskNode, failedTaskIds: Set<TaskId>): boolean {
    return node.dependsOn.some((depId) => failedTaskIds.has(depId));
  }

  /**
   * Find the first failed upstream dependency for skip reason.
   */
  private _findFailedUpstream(node: TaskNode, failedTaskIds: Set<TaskId>): TaskId {
    return node.dependsOn.find((depId) => failedTaskIds.has(depId)) ?? '';
  }
}
