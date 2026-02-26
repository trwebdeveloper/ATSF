import type { TaskId, TokenUsage, ExecutionSnapshot } from '../shared/types.js';

// ─── EventBus Interface ────────────────────────────────────────────

export interface EventBus {
  on<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe;
  once<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe;
  emit(event: ATSFEvent): void;
  removeAllListeners(): void;
}

export type ATSFEventType = ATSFEvent['type'];
export type EventListener<T extends ATSFEventType> = (event: ATSFEventMap[T]) => void | Promise<void>;
export type Unsubscribe = () => void;
export type ATSFEventMap = { [E in ATSFEvent as E['type']]: E };

// ─── Event Base ────────────────────────────────────────────────────

export interface ATSFEventBase {
  readonly timestamp: Date;
  readonly source: string;
}

// ─── Execution Lifecycle Events ────────────────────────────────────

export interface ExecutionStartedEvent extends ATSFEventBase {
  readonly type: 'execution.started';
  readonly totalTasks: number;
  readonly graphId: string;
}

export interface ExecutionCompletedEvent extends ATSFEventBase {
  readonly type: 'execution.completed';
  readonly success: boolean;
  readonly snapshot: ExecutionSnapshot;
  readonly durationMs: number;
}

export interface ExecutionCancelledEvent extends ATSFEventBase {
  readonly type: 'execution.cancelled';
  readonly reason: string;
  readonly snapshot: ExecutionSnapshot;
}

export interface ExecutionPausedEvent extends ATSFEventBase {
  readonly type: 'execution.paused';
}

export interface ExecutionResumedEvent extends ATSFEventBase {
  readonly type: 'execution.resumed';
}

// ─── Task Lifecycle Events ─────────────────────────────────────────

export interface TaskReadyEvent extends ATSFEventBase {
  readonly type: 'task.ready';
  readonly taskId: TaskId;
  readonly layer: number;
}

export interface TaskStartedEvent extends ATSFEventBase {
  readonly type: 'task.started';
  readonly taskId: TaskId;
  readonly agent: string;
  readonly attempt: number;
}

export interface TaskCompletedEvent extends ATSFEventBase {
  readonly type: 'task.completed';
  readonly taskId: TaskId;
  readonly durationMs: number;
  readonly tokenUsage?: TokenUsage;
  readonly result?: unknown;
}

export interface TaskFailedEvent extends ATSFEventBase {
  readonly type: 'task.failed';
  readonly taskId: TaskId;
  readonly error: string;
  readonly attempt: number;
  readonly willRetry: boolean;
}

export interface TaskRetryingEvent extends ATSFEventBase {
  readonly type: 'task.retrying';
  readonly taskId: TaskId;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly delayMs: number;
}

export interface TaskSkippedEvent extends ATSFEventBase {
  readonly type: 'task.skipped';
  readonly taskId: TaskId;
  readonly reason: string;
  readonly failedUpstream: TaskId;
}

// ─── Resilience Events ─────────────────────────────────────────────

export interface CircuitOpenedEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.opened';
  readonly provider: string;
  readonly failureCount: number;
  readonly cooldownMs: number;
}

export interface CircuitHalfOpenEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.halfOpen';
  readonly provider: string;
}

export interface CircuitClosedEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.closed';
  readonly provider: string;
}

export interface ConcurrencyAdjustedEvent extends ATSFEventBase {
  readonly type: 'resilience.concurrency.adjusted';
  readonly previous: number;
  readonly current: number;
  readonly reason: string;
}

export interface RateLimitedEvent extends ATSFEventBase {
  readonly type: 'resilience.rateLimited';
  readonly provider: string;
  readonly delayMs: number;
}

// ─── Debate Events ─────────────────────────────────────────────────

export interface DebateStartedEvent extends ATSFEventBase {
  readonly type: 'debate.started';
  readonly topic: string;
  readonly proposerCount: number;
}

export interface DebateRoundCompletedEvent extends ATSFEventBase {
  readonly type: 'debate.round.completed';
  readonly roundNumber: number;
  readonly convergenceScore: number;
}

export interface DebateDecisionMadeEvent extends ATSFEventBase {
  readonly type: 'debate.decision.made';
  readonly decisionId: string;
  readonly convergenceAchieved: boolean;
}

// ─── Escalation Events ─────────────────────────────────────────────

export interface EscalationCreatedEvent extends ATSFEventBase {
  readonly type: 'escalation.created';
  readonly issueId: string;
  readonly taskId: TaskId;
  readonly category: string;
  readonly severity: string;
}

export interface EscalationResolvedEvent extends ATSFEventBase {
  readonly type: 'escalation.resolved';
  readonly issueId: string;
  readonly taskId: TaskId;
  readonly resolution: 'answered' | 'dismissed' | 'deferred';
}

export interface TaskBlockedOnHumanEvent extends ATSFEventBase {
  readonly type: 'task.blocked_on_human';
  readonly taskId: TaskId;
  readonly issueId: string;
  readonly reason: string;
}

// ─── Discriminated Union ───────────────────────────────────────────

export type ATSFEvent =
  | ExecutionStartedEvent | ExecutionCompletedEvent | ExecutionCancelledEvent
  | ExecutionPausedEvent  | ExecutionResumedEvent
  | TaskReadyEvent        | TaskStartedEvent       | TaskCompletedEvent
  | TaskFailedEvent       | TaskRetryingEvent       | TaskSkippedEvent
  | CircuitOpenedEvent    | CircuitHalfOpenEvent    | CircuitClosedEvent
  | ConcurrencyAdjustedEvent | RateLimitedEvent
  | DebateStartedEvent    | DebateRoundCompletedEvent | DebateDecisionMadeEvent
  | EscalationCreatedEvent | EscalationResolvedEvent | TaskBlockedOnHumanEvent;
