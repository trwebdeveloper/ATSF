import type { TaskNode } from '../../dag/types.js';
import type { TaskId, TokenUsage } from '../../shared/types.js';
import type { EventBus } from '../../events/types.js';
import type { ProviderRegistry } from '../../providers/types.js';
import type { ResilienceLayer } from '../../resilience/resilience-layer.js';
import type { FileLockManager, FileAccess } from './file-lock-manager.js';
import { withLangDirective } from '../../emitter/i18n.js';

/**
 * Agent definition mapping agent type to provider/model.
 */
export interface AgentDefinition {
  readonly provider: string;
  readonly model: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
}

/**
 * Runtime context passed to the TaskExecutor for each task dispatch.
 */
export interface ExecutionContext {
  readonly providerRegistry: ProviderRegistry;
  readonly resilience: ResilienceLayer;
  readonly lockManager: FileLockManager;
  readonly eventBus: EventBus;
  readonly agentDefinitions: ReadonlyMap<string, AgentDefinition>;
  readonly signal?: AbortSignal;
  readonly lang?: string;
}

/**
 * The result of a single task execution.
 */
export interface TaskResult {
  readonly taskId: TaskId;
  readonly output: unknown;
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
}

/**
 * Convert TaskNode file lists to FileAccess[] for the FileLockManager.
 */
function toFileAccess(node: TaskNode): FileAccess[] {
  return [
    ...node.filesWrite.map((p) => ({ pattern: p, mode: 'write' as const })),
    ...node.filesRead.map((p) => ({ pattern: p, mode: 'read' as const })),
  ];
}

/**
 * TaskExecutor dispatches a single TaskNode to its assigned provider.
 * Acquires file locks, invokes the provider through the resilience layer,
 * and releases locks on completion or failure.
 *
 * Source: Parallel execution (Section 9);
 * dag-events-resilience correction Section 1.
 */
export class TaskExecutorImpl {
  /**
   * Dispatch a single task to its assigned provider.
   */
  async dispatch(node: TaskNode, context: ExecutionContext): Promise<TaskResult> {
    const { providerRegistry, resilience, lockManager, eventBus, agentDefinitions, signal } = context;
    const startMs = Date.now();
    const fileAccess = toFileAccess(node);

    // Acquire file locks (all-or-nothing)
    await lockManager.acquire(node.id, fileAccess);

    try {
      // Emit task.started
      eventBus.emit({
        type: 'task.started',
        taskId: node.id,
        agent: node.agent,
        attempt: 1,
        timestamp: new Date(),
        source: 'task-executor',
      });

      // Resolve agent -> provider
      const agentDef = agentDefinitions.get(node.agent);
      const providerId = agentDef?.provider ?? node.agent;
      const provider = providerRegistry.get(providerId);
      const model = agentDef?.model ?? provider.supportedModels[0];

      // Build prompt from task node
      const prompt = `Task: ${node.name}\nDescription: ${node.description}\nType: ${node.type}`;

      // Capture token usage from within the resilience layer call
      let capturedTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      // Execute through resilience layer
      const output = await resilience.execute(
        providerId,
        async () => {
          const response = await provider.generate({
            model,
            prompt,
            systemPrompt: agentDef?.systemPrompt
              ? withLangDirective(agentDef.systemPrompt, context.lang ?? 'en')
              : undefined,
            temperature: agentDef?.temperature,
            signal,
          });

          capturedTokenUsage = response.usage;

          return {
            value: response.content,
            tokenUsage: response.usage,
            latencyMs: Date.now() - startMs,
          };
        },
        signal,
      );

      const durationMs = Date.now() - startMs;

      const result: TaskResult = {
        taskId: node.id,
        output,
        tokenUsage: capturedTokenUsage,
        durationMs,
      };

      // Emit task.completed
      eventBus.emit({
        type: 'task.completed',
        taskId: node.id,
        durationMs,
        tokenUsage: capturedTokenUsage,
        result: output,
        timestamp: new Date(),
        source: 'task-executor',
      });

      return result;
    } catch (err) {
      // Emit task.failed
      eventBus.emit({
        type: 'task.failed',
        taskId: node.id,
        error: err instanceof Error ? err.message : String(err),
        attempt: 1,
        willRetry: false,
        timestamp: new Date(),
        source: 'task-executor',
      });

      throw err;
    } finally {
      // Always release file locks
      lockManager.release(node.id);
    }
  }
}
