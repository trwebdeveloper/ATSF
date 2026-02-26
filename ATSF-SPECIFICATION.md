# ATSF Technical Specification v1.0

**AutoTurnkey Spec Factory -- Definitive Technical Specification**

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Date | 2026-02-25 |
| Status | Approved |
| Sources | 10 research agents, 5 correction documents, 1 synthesis report |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [CLI Design](#3-cli-design)
4. [Provider System](#4-provider-system)
5. [Task Graph & DAG](#5-task-graph--dag)
6. [Debate Engine](#6-debate-engine)
7. [Quality Gates](#7-quality-gates)
    - [7.6 Gate Plugin Interface](#76-gate-plugin-interface)
    - [7.7 Gate Registration and Discovery](#77-gate-registration-and-discovery)
    - [7.8 Gate Configuration Schema](#78-gate-configuration-schema)
8. [Contract System](#8-contract-system)
9. [Parallel Execution](#9-parallel-execution)
10. [Emitter & Artifacts](#10-emitter--artifacts)
    - [10.7 Output Contract (Zod Schemas)](#107-output-contract-zod-schemas)
    - [10.8 Cross-Reference Specification](#108-cross-reference-specification)
    - [10.9 Realistic Output Examples](#109-realistic-output-examples)
11. [Dependencies & Versions](#11-dependencies--versions)
12. [MVP Roadmap](#12-mvp-roadmap)
13. [Competitive Positioning](#13-competitive-positioning)
14. [Known Limitations & Future Work](#14-known-limitations--future-work)
    - [14.3 User Interaction Model](#143-user-interaction-model)
    - [14.4 Testing Strategy](#144-testing-strategy)
    - [14.5 Security Model](#145-security-model)
    - [14.9 Configuration Schema](#149-configuration-schema)
    - [14.11 Observability and Debugging](#1411-observability-and-debugging)
15. [Feedback Loop](#15-feedback-loop)
    - [15.13 Escalation & Human-in-the-Loop](#1513-escalation--human-in-the-loop)
- [Appendix A: Correction Traceability Matrix](#appendix-a-correction-traceability-matrix)
- [Appendix B: Consensus Areas (High Confidence)](#appendix-b-consensus-areas-high-confidence)
- [Appendix C: Module Dependency Graph](#appendix-c-module-dependency-graph)
- [Appendix D: File Conflict Resolution Design](#appendix-d-file-conflict-resolution-design)

---

## 1. Project Overview

### 1.1 What ATSF Is

ATSF (AutoTurnkey Spec Factory) is an **AI Specification Engine** -- a CLI tool that orchestrates multiple AI agents to produce comprehensive, validated software project specifications. ATSF does not generate code. It generates the detailed planning artifacts that precede code: task graphs, architecture decision records, repository blueprints, developer tickets, and AI prompt packs.

This positioning is deliberate. As established by the competitive analysis (Section 13), no existing tool combines multi-agent debate, quality gate validation, DAG-scheduled task decomposition, and structured prompt generation into a single planning pipeline. Competitors (MetaGPT, AutoGen, CrewAI, ChatDev, OpenHands, SWE-Agent, Aider, Cursor, Copilot Workspace) focus on code generation or conversation management. ATSF fills the "planning gap" that sits upstream of all of them.

**Category:** AI Specification Engine (new category, distinct from "AI code generator" or "AI coding assistant").

> Source: Competitive analysis (Section 13); synthesis report HC10.

### 1.2 Five Unique Value Propositions

1. **Planning Gap Coverage.** ATSF is the only tool that produces structured, machine-parseable planning artifacts from a natural language project description. Competitors start at code; ATSF starts at architecture.

2. **Contract-First Validation.** Every agent output is validated against Zod schemas at three levels (structural, semantic, cross-agent). Malformed specifications are caught before they reach downstream consumers.

3. **Debate Engine.** Architectural decisions are made through a structured 3-round multi-agent debate protocol with judge synthesis, producing auditable Architecture Decision Records (ADRs).

4. **AI Prompt Pack.** ATSF emits self-contained, per-task prompts that any downstream code-generation tool (Cursor, Aider, Claude Code) can consume directly. Each prompt includes inlined contracts, negative instructions, and task-type-specific templates.

5. **Parallel-Safe File Locking.** Task graph execution uses DAG-scheduled parallelism with micromatch-based file conflict detection and in-memory lock management, ensuring no two concurrent tasks can corrupt shared files.

> Source: Competitive analysis, Section "5 unique value props." (Section 13).

### 1.3 Target Market Segments

| Segment | Use Case | Estimated Value |
|---------|----------|-----------------|
| **Agencies** | Generate project specs for client handoff | $200-500/project |
| **Startups** | Rapid architecture planning for MVPs | $50-200/month |
| **Enterprise** | Standardized specification pipelines across teams | $500-2000/month |

> Source: Competitive analysis, market segments (Section 13).

---

## 2. Architecture

### 2.1 Hybrid DAG + Supervisor Pattern

ATSF uses a **Hybrid DAG + Supervisor** orchestration pattern, scoring 35/40 in the architecture evaluation against Pure DAG, Blackboard, and Market-based alternatives.

**Why Hybrid DAG + Supervisor:**
- The DAG provides deterministic execution ordering, parallelism where dependencies allow, and static analyzability (cycle detection, critical path).
- The Supervisor (OrchestratorEngine) provides dynamic oversight: reacting to failures, enforcing budgets, triggering quality gates, and coordinating UI updates.
- Neither alone is sufficient. A Pure DAG cannot adapt to runtime failures. A Pure Supervisor cannot exploit parallelism efficiently.

The architecture is **command-driven core + event overlay**:
- Commands flow downward: CLI -> OrchestratorEngine -> DAGScheduler -> TaskExecutor -> Provider.
- Events flow upward: Provider -> TaskExecutor -> EventBus -> OrchestratorEngine -> CLI UI.

> Source: Architecture selection (Section 2); dag-events-resilience correction Section 2.4.

### 2.2 Module Structure

The corrected module structure consolidates overlapping implementations identified in the synthesis report (contradictions C2, C3, C4) and resolves the naming contradiction (C6) by retaining the `contracts/` directory to align with the contract-first paradigm (Section 8).

```
src/
  cli/                    # Oclif commands (init, plan, debate, build, gate, emit, serve, query, review)
    commands/
      init.ts
      plan.ts
      debate.ts
      build.ts
      gate/
        index.ts
        check.ts
        list.ts
      emit.ts
      serve.ts              # NEW: atsf serve command
      query.ts              # NEW: atsf query command
      review/               # NEW: atsf review command (escalation review)
        index.ts            # atsf review (default: list pending)
        answer.ts           # atsf review answer ISS-001
        export.ts           # atsf review export
        import.ts           # atsf review import answers.json
    hooks/
      init.ts             # Pre-command config loading
  orchestrator/
    engine.ts             # OrchestratorEngine -- top-level coordinator
    config.ts             # OrchestratorConfig, cosmiconfig loading
  dag/                    # Unified DAG module (correction: merged separate static + runtime implementations)
    types.ts              # TaskNode, TaskEdge, TaskGraph, etc.
    static/
      graph-builder.ts    # Graph construction from YAML
      validator.ts        # DFS 3-color cycle detection
      conflict-detector.ts # micromatch file conflict detection
      topological-sort.ts # Single Kahn's algorithm implementation
    runtime/
      scheduler.ts        # DAGScheduler (consumes TaskGraph.layers)
      executor.ts         # Task dispatch with resilience
      file-lock-manager.ts # In-memory lock manager
      monitor.ts          # Execution progress snapshots
  agents/                 # Agent definitions and prompt templates
    definitions.ts        # AgentDefinition registry
    prompts/              # Prompt templates per agent type
  providers/              # Provider adapters
    types.ts              # ProviderAdapter interface
    registry.ts           # ProviderRegistry
    openrouter.ts         # OpenRouter via AI SDK v5
    claude-code.ts        # Claude Code CLI via child_process
  resilience/             # Unified resilience layer (correction: merged rate-limiting + circuit-breaker implementations)
    types.ts
    rate-limiter.ts       # TokenBucketRateLimiter
    semaphore.ts          # Counting semaphore
    circuit-breaker.ts    # Per-provider circuit breaker
    adaptive-concurrency.ts # AdaptiveConcurrencyController
    cost-tracker.ts       # Budget enforcement
    resilience-layer.ts   # Facade composing all resilience concerns
  debate/                 # Debate engine
    engine.ts             # 3-round debate orchestration
    judge.ts              # Judge-agent synthesis
    convergence.ts        # Convergence detection
    adr-generator.ts      # MADR v4 ADR output
  gates/                  # Quality gate pipeline
    types.ts              # Gate, GateResult, GateReport interfaces
    orchestrator.ts       # Parallel gate execution
    coverage.ts           # Coverage gate
    consistency.ts        # Consistency gate
    testability.ts        # Testability gate
    buildability.ts       # Buildability gate
    security.ts           # Security gate
    fix-engine.ts         # Declarative auto-fix
    reporters/            # Console, JSON, Markdown, JUnit reporters
  contracts/              # Zod schemas and contract management (kept as "contracts/", not "schemas/")
    schemas.ts            # 9-field agent output schema
    envelope.ts           # Versioned envelope with discriminated union
    validator.ts          # L1/L2/L3 validation pipeline
    lock-manager.ts       # Contract lock manager with TTL
    dependency-graph.ts   # Contract change propagation
  emitter/                # Artifact generation
    types.ts              # EmitterPipeline, VirtualFS
    pipeline.ts           # Sequential emitter pipeline
    virtual-fs.ts         # In-memory FS with atomic flush
    emitters/
      task-graph.ts       # task_graph.yaml emitter
      repo-blueprint.ts   # repo_blueprint.yaml emitter
      mpd.ts              # MPD.md (Master Planning Document)
      tickets.ts          # tickets/ directory
      prompt-pack.ts      # ai_prompt_pack/ directory
      manifest.ts         # manifest.json
    templates/            # Eta v4 templates
  events/                 # EventBus system
    types.ts              # ATSFEvent discriminated union (22 event types)
    event-bus.ts          # EventBus implementation
  config/                 # Configuration loading
    schema.ts             # Config Zod schema
    loader.ts             # cosmiconfig integration
  telemetry/              # Structured logging
    logger.ts             # pino setup
  serve/                  # Feedback loop server (Section 15)
    server.ts             # Fastify server setup + route registration
    routes/
      query.ts            # POST /api/query
      tasks.ts            # GET /api/tasks, /api/tasks/:id, etc.
      blueprint.ts        # GET /api/blueprint
      decisions.ts        # GET /api/decisions, /api/decisions/:id
      mpd.ts              # GET /api/mpd, /api/mpd/:section
      validate.ts         # POST /api/validate
      report-issue.ts     # POST /api/report-issue
      status.ts           # GET /api/status
      review.ts           # GET /api/review/pending, POST /api/review/:issueId
    index/
      artifact-index.ts   # ArtifactIndex: loads + indexes all artifacts
      bm25-engine.ts      # BM25 search wrapper using wink-bm25-text-search
      cross-ref.ts        # Cross-reference resolver (task -> ticket -> prompt)
    query-engine.ts       # QueryEngine: BM25 retrieval + optional LLM synthesis
    issue-log.ts          # Issue logging (in-memory + JSONL persistence)
    mcp-bridge.ts         # MCP server adapter (wraps routes as MCP tools)
    schemas.ts            # All Zod request/response schemas for the serve API
  shared/                 # Cross-cutting utilities
    errors.ts             # Error hierarchy
    types.ts              # Shared type aliases
```

> Source: Architecture module structure; dag-events-resilience correction Section 1.2; synthesis report C6 resolution.

### 2.3 Core TypeScript Interfaces

#### 2.3.1 ProviderAdapter

```typescript
// Contract: implement exactly as specified
/**
 * Adapter interface for AI model providers.
 * All providers (OpenRouter, Claude Code CLI, future local models)
 * implement this interface.
 *
 * Source: Provider system (Section 4); dag-events-resilience correction Section 3.
 */
interface ProviderAdapter {
  /** Unique identifier for this provider (e.g., "openrouter", "claude-code") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** List of supported model identifiers */
  readonly supportedModels: readonly string[];

  /**
   * Execute a prompt and return a structured result.
   * This is a RAW provider call -- no resilience wrapping.
   * Callers (DebateEngine, TaskExecutor, GatePlugin) MUST wrap calls
   * in ResilienceLayer.execute() themselves. This gives callers control
   * over retry/budget policy per use case.
   */
  generate(request: GenerateRequest): Promise<GenerateResponse>;

  /** Check if the provider is reachable */
  healthCheck(): Promise<boolean>;
}

interface GenerateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly schema?: import('zod').ZodType;    // For structured output
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;              // For cancellation of long-running provider calls
}

interface GenerateResponse {
  readonly content: string;
  readonly object?: unknown;                  // Parsed structured output
  readonly model: string;
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  readonly usage: TokenUsage;                 // Token counts from the provider (Section 9.4.1)
}

/**
 * Registry for managing multiple ProviderAdapter instances.
 * Provides lookup by ID, default provider selection, and bulk health checks.
 *
 * Source: Provider system (Section 4); dag-events-resilience correction Section 3.
 */
interface ProviderRegistry {
  /** Register a new provider adapter. Throws if a provider with the same id is already registered. */
  register(provider: ProviderAdapter): void;

  /** Retrieve a provider by its unique id. Throws if not found. */
  get(id: string): ProviderAdapter;

  /** Return the default provider (configured via atsf.config). */
  getDefault(): ProviderAdapter;

  /** List all registered providers. */
  list(): readonly ProviderAdapter[];

  /** Run healthCheck() on all registered providers. Returns a map of provider id to health status. */
  healthCheckAll(): Promise<Map<string, boolean>>;
}

/**
 * Utility to extract TokenUsage from a GenerateResponse.
 * Used by all callers that wrap provider calls in ResilienceLayer.execute():
 * DebateEngine (Section 6.8.3), TaskExecutor (Section 9.1), GatePlugins (Section 7.6.1).
 * Located in src/providers/utils.ts.
 */
function extractTokenUsage(response: GenerateResponse): TokenUsage {
  return response.usage;
}
```

#### 2.3.2 AgentDefinition

```typescript
// Contract: implement exactly as specified
/**
 * Defines an AI agent's role, prompt templates, and output schema.
 * The orchestrator instantiates agents based on these definitions.
 *
 * Source: Architecture interfaces (Section 2).
 */
interface AgentDefinition {
  /** Unique agent type identifier (e.g., "planner", "critic", "builder") */
  readonly type: string;

  /** Human-readable description of the agent's role */
  readonly description: string;

  /** The provider to use for this agent */
  readonly provider: string;

  /** The model to use (provider-specific identifier) */
  readonly model: string;

  /** System prompt template (Eta template string) */
  readonly systemPromptTemplate: string;

  /** Output schema this agent must conform to */
  readonly outputSchema: import('zod').ZodType;

  /** Maximum retries before giving up */
  readonly maxRetries: number;

  /** Temperature for generation (0.0 - 1.0) */
  readonly temperature: number;
}
```

#### 2.3.3 OrchestratorEngine

```typescript
// Contract: implement exactly as specified
/**
 * Top-level coordinator. Wires together all subsystems and drives the
 * full pipeline from input to artifacts.
 *
 * Source: Architecture (Section 2); dag-events-resilience correction Section 2.5.
 */
interface OrchestratorEngine {
  /**
   * Run the full pipeline:
   * 1. Parse input -> RawTaskDefinition[]
   * 2. Build and validate graph (static layer)
   * 3. Create scheduler with EventBus
   * 4. Subscribe to events for UI, telemetry, cost tracking
   * 5. Execute graph (runtime layer)
   * 6. Run quality gates on outputs
   * 7. Emit artifacts
   */
  run(config: OrchestratorConfig): Promise<OrchestratorResult>;

  /** Access the event bus for external subscribers (plugins, CLI UI) */
  readonly eventBus: EventBus;
}

interface OrchestratorConfig {
  readonly inputPath: string;
  readonly workspaceRoot: string;
  readonly providers: readonly string[];
  readonly maxConcurrency?: number;
  readonly interactive?: boolean;
  readonly signal?: AbortSignal;
}

interface OrchestratorResult {
  readonly success: boolean;
  readonly artifacts: readonly string[];
  readonly executionSnapshot: ExecutionSnapshot;
  readonly totalCostUsd: number;
  readonly durationMs: number;
}

/**
 * Pipeline Factory: wires together all subsystems for OrchestratorEngine construction.
 * Enables testing individual subsystems in isolation and swapping implementations
 * (e.g., mock providers for CI).
 */
interface Pipeline {
  readonly eventBus: EventBus;
  readonly resilience: ResilienceLayer;
  readonly providerRegistry: ProviderRegistry;
  readonly graphBuilder: GraphBuilder;
  readonly debateEngine: DebateEngine;
  readonly gateOrchestrator: GateOrchestrator;
  readonly emitterPipeline: EmitterPipeline;
}

function createPipeline(config: OrchestratorConfig): Pipeline;
```

> **Construction:** `OrchestratorEngine` receives a `Pipeline` from `createPipeline()` and calls subsystems in order. This enables testing individual subsystems in isolation and swapping implementations (e.g., mock providers for CI).

### 2.4 EventBus with 22 Event Types

The EventBus is the cross-cutting event distribution system for ATSF. It carries 22 event types organized into five categories.

The OrchestratorEngine creates the EventBus and injects it into subsystems (DAGScheduler, ResilienceLayer, DebateEngine) via constructor dependency injection. Subsystems emit events; the OrchestratorEngine and CLI UI subscribe to them.

**Design principle:** Event emission must never fail the emitter. Listener errors are logged via pino, not propagated.

#### Event Categories

| Category | Events | Count |
|----------|--------|-------|
| Execution Lifecycle | `execution.started`, `execution.completed`, `execution.cancelled`, `execution.paused`, `execution.resumed` | 5 |
| Task Lifecycle | `task.ready`, `task.started`, `task.completed`, `task.failed`, `task.retrying`, `task.skipped` | 6 |
| Resilience | `resilience.circuit.opened`, `resilience.circuit.halfOpen`, `resilience.circuit.closed`, `resilience.concurrency.adjusted`, `resilience.rateLimited` | 5 |
| Debate | `debate.started`, `debate.round.completed`, `debate.decision.made` | 3 |
| Escalation | `escalation.created`, `escalation.resolved`, `task.blocked_on_human` | 3 |
| **Total** | | **22** |

#### EventBus Interface

```typescript
// Contract: implement exactly as specified
/**
 * Central event bus for the ATSF system.
 * Synchronous emit with async listener support (fire-and-forget for async).
 *
 * Source: Architecture (Section 2); dag-events-resilience correction Section 2.5
 * (integrated execution and resilience events).
 */
interface EventBus {
  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe;

  /** Subscribe for one occurrence only. */
  once<T extends ATSFEventType>(type: T, listener: EventListener<T>): Unsubscribe;

  /** Emit an event to all registered listeners. */
  emit(event: ATSFEvent): void;

  /** Remove all listeners (for cleanup/testing). */
  removeAllListeners(): void;
}

type ATSFEventType = ATSFEvent['type'];
type EventListener<T extends ATSFEventType> = (event: ATSFEventMap[T]) => void | Promise<void>;
type Unsubscribe = () => void;
type ATSFEventMap = { [E in ATSFEvent as E['type']]: E };
```

#### ATSFEvent Discriminated Union

```typescript
// Contract: implement exactly as specified
/**
 * Semantic type alias for task identifiers throughout ATSF.
 * Using a named type instead of raw `string` improves readability
 * and enables future refinement (e.g., branded types).
 */
type TaskId = string;

/**
 * All 22 ATSF events as a discriminated union on the `type` field.
 * Each event extends ATSFEventBase with timestamp and source module.
 */
interface ATSFEventBase {
  readonly timestamp: Date;
  readonly source: string;
}

// Execution Lifecycle Events
interface ExecutionStartedEvent extends ATSFEventBase {
  readonly type: 'execution.started';
  readonly totalTasks: number;
  readonly graphId: string;
}

interface ExecutionCompletedEvent extends ATSFEventBase {
  readonly type: 'execution.completed';
  readonly success: boolean;
  readonly snapshot: ExecutionSnapshot;
  readonly durationMs: number;
}

interface ExecutionCancelledEvent extends ATSFEventBase {
  readonly type: 'execution.cancelled';
  readonly reason: string;
  readonly snapshot: ExecutionSnapshot;
}

interface ExecutionPausedEvent extends ATSFEventBase {
  readonly type: 'execution.paused';
}

interface ExecutionResumedEvent extends ATSFEventBase {
  readonly type: 'execution.resumed';
}

// Task Lifecycle Events
interface TaskReadyEvent extends ATSFEventBase {
  readonly type: 'task.ready';
  readonly taskId: TaskId;
  readonly layer: number;
}

interface TaskStartedEvent extends ATSFEventBase {
  readonly type: 'task.started';
  readonly taskId: TaskId;
  readonly agent: string;
  readonly attempt: number;
}

interface TaskCompletedEvent extends ATSFEventBase {
  readonly type: 'task.completed';
  readonly taskId: TaskId;
  readonly durationMs: number;
  readonly tokenUsage?: TokenUsage;
  readonly result?: unknown;
}

interface TaskFailedEvent extends ATSFEventBase {
  readonly type: 'task.failed';
  readonly taskId: TaskId;
  readonly error: string;
  readonly attempt: number;
  readonly willRetry: boolean;
}

interface TaskRetryingEvent extends ATSFEventBase {
  readonly type: 'task.retrying';
  readonly taskId: TaskId;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly delayMs: number;
}

interface TaskSkippedEvent extends ATSFEventBase {
  readonly type: 'task.skipped';
  readonly taskId: TaskId;
  readonly reason: string;
  readonly failedUpstream: TaskId;
}

// Resilience Events
interface CircuitOpenedEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.opened';
  readonly provider: string;
  readonly failureCount: number;
  readonly cooldownMs: number;
}

interface CircuitHalfOpenEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.halfOpen';
  readonly provider: string;
}

interface CircuitClosedEvent extends ATSFEventBase {
  readonly type: 'resilience.circuit.closed';
  readonly provider: string;
}

interface ConcurrencyAdjustedEvent extends ATSFEventBase {
  readonly type: 'resilience.concurrency.adjusted';
  readonly previous: number;
  readonly current: number;
  readonly reason: string;
}

interface RateLimitedEvent extends ATSFEventBase {
  readonly type: 'resilience.rateLimited';
  readonly provider: string;
  readonly delayMs: number;
}

// Escalation Events
interface EscalationCreatedEvent extends ATSFEventBase {
  readonly type: 'escalation.created';
  readonly issueId: string;
  readonly taskId: TaskId;
  readonly category: string;
  readonly severity: string;
}

interface EscalationResolvedEvent extends ATSFEventBase {
  readonly type: 'escalation.resolved';
  readonly issueId: string;
  readonly taskId: TaskId;
  readonly resolution: 'answered' | 'dismissed' | 'deferred';
}

interface TaskBlockedOnHumanEvent extends ATSFEventBase {
  readonly type: 'task.blocked_on_human';
  readonly taskId: TaskId;
  readonly issueId: string;
  readonly reason: string;
}

// Debate Events
interface DebateStartedEvent extends ATSFEventBase {
  readonly type: 'debate.started';
  readonly topic: string;
  readonly proposerCount: number;
}

interface DebateRoundCompletedEvent extends ATSFEventBase {
  readonly type: 'debate.round.completed';
  readonly roundNumber: number;
  readonly convergenceScore: number;
}

interface DebateDecisionMadeEvent extends ATSFEventBase {
  readonly type: 'debate.decision.made';
  readonly decisionId: string;
  readonly convergenceAchieved: boolean;
}

// Union type
type ATSFEvent =
  | ExecutionStartedEvent | ExecutionCompletedEvent | ExecutionCancelledEvent
  | ExecutionPausedEvent  | ExecutionResumedEvent
  | TaskReadyEvent        | TaskStartedEvent       | TaskCompletedEvent
  | TaskFailedEvent       | TaskRetryingEvent       | TaskSkippedEvent
  | CircuitOpenedEvent    | CircuitHalfOpenEvent    | CircuitClosedEvent
  | ConcurrencyAdjustedEvent | RateLimitedEvent
  | DebateStartedEvent    | DebateRoundCompletedEvent | DebateDecisionMadeEvent
  | EscalationCreatedEvent | EscalationResolvedEvent | TaskBlockedOnHumanEvent;
```

> Source: dag-events-resilience correction Sections 2.3--2.5.

#### Event Emission Mapping

Each event is emitted by a specific subsystem. This mapping defines the authoritative source for each event category:

| Event | Emitted By |
|-------|-----------|
| `execution.started` | DAGScheduler.execute() |
| `execution.completed` | DAGScheduler.execute() |
| `execution.cancelled` | DAGScheduler (on AbortSignal) |
| `execution.paused` | DAGScheduler.pause() |
| `execution.resumed` | DAGScheduler.resume() |
| `task.ready` | DAGScheduler (when deps met) |
| `task.started` | TaskExecutor.dispatch() |
| `task.completed` | TaskExecutor.dispatch() |
| `task.failed` | TaskExecutor.dispatch() |
| `task.retrying` | ResilienceLayer.execute() |
| `task.skipped` | DAGScheduler (upstream failed) |
| `resilience.*` | ResilienceLayer |
| `debate.*` | DebateEngine |
| `escalation.*` | QueryEngine / IssueLog |
| `task.blocked_on_human` | Orchestrator (external) |

### 2.5 Command-Driven Core + Event Overlay

The execution model separates concerns cleanly:

```
Commands (synchronous, top-down):
  CLI invocation
    -> OrchestratorEngine.run()
      -> GraphBuilder.build()      (static analysis)
      -> DAGScheduler.execute()    (runtime execution)
        -> ResilienceLayer.execute() (per-provider call)

Events (asynchronous, bottom-up):
  Provider response received
    -> TaskExecutor emits task.completed
      -> EventBus delivers to all subscribers:
        -> OrchestratorEngine updates cost tracker
        -> CLI UI updates progress spinner
        -> Telemetry module logs structured data
```

The OrchestratorEngine is the bridge: it issues commands downward and listens to events upward. It does NOT micromanage scheduling -- it delegates entirely to the DAGScheduler for execution ordering and only observes and reacts.

> Source: Architecture (Section 2); dag-events-resilience correction Section 2.4.

---

## 3. CLI Design

### 3.1 Framework: Oclif

**CORRECTED from the original CLI framework recommendation.**

The initial CLI framework analysis rated Oclif highest at 85/100, yet recommended Commander.js at 56/100 (the lowest score). The CLI framework correction document resolved this contradiction through a weighted scoring matrix tailored to ATSF's requirements.

**Final weighted scores:**

| Framework | TS-First (25%) | Multi-Cmd (20%) | Plugins (20%) | Size (10%) | Testing (15%) | Community (10%) | **TOTAL** |
|-----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Oclif** | 23.75 | 19.0 | 19.6 | 5.5 | 13.5 | 8.5 | **89.85** |
| Commander.js | 20.0 | 16.0 | 6.0 | 9.8 | 10.5 | 9.5 | 71.80 |
| Yargs | 15.0 | 15.0 | 8.0 | 6.5 | 8.25 | 7.5 | 60.25 |

**Key reasons Oclif wins:**

1. **Plugin architecture is non-negotiable for ATSF.** ATSF needs provider plugins, debate engine plugins, and quality gate plugins. Oclif has production-proven plugin infrastructure (`@oclif/plugin-plugins` for runtime install/uninstall). Commander.js has no plugin system at all.

2. **TypeScript-first.** Oclif is written entirely in TypeScript. Its class-per-command pattern with static `flags` and `args` properties provides compile-time type safety.

3. **Testing utilities for Vitest.** `@oclif/test` v4 officially supports Vitest with `runCommand()` and `captureOutput()`.

4. **File-based command routing** maps cleanly to ATSF's commands: `src/commands/init.ts`, `src/commands/debate.ts`, etc.

> Source: cli-framework correction document, weighted scoring matrix.

### 3.2 Package Configuration

```json
{
  "name": "atsf",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "atsf": "./bin/run.js"
  },
  "oclif": {
    "bin": "atsf",
    "dirname": "atsf",
    "commands": {
      "strategy": "pattern",
      "target": "./dist/commands"
    },
    "plugins": [
      "@oclif/plugin-help",
      "@oclif/plugin-plugins"
    ],
    "topicSeparator": " "
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 3.3 Nine Commands

| Command | File Path | Description |
|---------|-----------|-------------|
| `atsf init` | `src/commands/init.ts` | Initialize project config (cosmiconfig + Zod validation) |
| `atsf plan` | `src/commands/plan.ts` | Generate execution plan from project description |
| `atsf debate` | `src/commands/debate.ts` | Run 3-round multi-agent debate on architecture decisions |
| `atsf build` | `src/commands/build.ts` | Execute DAG-scheduled task graph |
| `atsf gate` | `src/commands/gate/index.ts` | Run quality gate checks (with subcommands: `check`, `list`) |
| `atsf emit` | `src/commands/emit.ts` | Emit build artifacts (YAML, Markdown, tickets, prompts) |
| `atsf serve` | `src/commands/serve.ts` | Start feedback server (HTTP + optional MCP) for AI coder integration |
| `atsf query` | `src/commands/query.ts` | Query ATSF artifacts about the project (natural language Q&A) |
| `atsf review` | `src/commands/review/index.ts` | Review escalated issues (with subcommands: `answer`, `export`, `import`) |

Each command is a class extending Oclif's `Command` with typed `flags` and `args`:

```typescript
// Illustrative — adapt to your implementation
// Example: src/commands/debate.ts
import { Args, Command, Flags } from '@oclif/core';

export default class Debate extends Command {
  static override description = 'Run a multi-agent debate on the plan';

  static override args = {
    plan: Args.string({
      description: 'Path to the plan file',
      required: true,
    }),
  };

  static override flags = {
    engine: Flags.string({
      char: 'e',
      description: 'Debate engine to use',
      default: 'judge',
    }),
    rounds: Flags.integer({
      char: 'r',
      description: 'Number of debate rounds',
      default: 3,
      min: 1,
      max: 10,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file for debate results',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Debate);
    // Load debate engine, execute rounds, write output
  }
}
```

> Source: CLI design (Section 3); cli-framework correction command mapping and examples.

#### `atsf review` Command Class (Subcommand Pattern)

The 9th command provides human-in-the-loop review of escalated issues. Following the `atsf gate` precedent, it uses the Oclif topic/subcommand pattern with four files.

##### `atsf review` (List View) -- `src/commands/review/index.ts`

```typescript
// Reference implementation
import { Command, Flags } from '@oclif/core';

export default class Review extends Command {
  static override description = 'List pending escalation questions from AI coders';

  static override flags = {
    status: Flags.string({
      char: 's', description: 'Filter by status',
      options: ['pending', 'answered', 'dismissed', 'all'], default: 'pending',
    }),
    severity: Flags.string({
      description: 'Filter by severity',
      options: ['critical', 'major', 'minor', 'suggestion'],
    }),
    category: Flags.string({
      description: 'Filter by issue category',
      options: [
        'ambiguous_spec', 'missing_detail', 'dependency_conflict',
        'infeasible_constraint', 'schema_mismatch', 'needs_human_judgment',
      ],
    }),
    task: Flags.string({
      char: 't', description: 'Filter by task ID (e.g., TASK-003)',
    }),
    sort: Flags.string({
      description: 'Sort order',
      options: ['severity', 'timestamp', 'task'], default: 'severity',
    }),
    format: Flags.string({
      char: 'f', description: 'Output format',
      options: ['table', 'json'], default: 'table',
    }),
    output: Flags.string({
      char: 'o', description: 'Path to ATSF output directory',
      default: './atsf-output',
    }),
    port: Flags.integer({
      char: 'p', description: 'Port of running atsf serve instance',
      default: 4567,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Review);
    // 1. Try to connect to running atsf serve at localhost:{port}
    // 2. If not running, load IssueLog from JSONL file directly
    // 3. Apply filters (status, severity, category, task)
    // 4. Sort results
    // 5. Render table (ink for TTY) or JSON output
  }
}
```

**Table output (TTY/ink):**
```
ID         Task       Category          Severity  Age     Summary
---------  ---------  ----------------  --------  ------  --------------------------
ISS-001    TASK-003   ambiguous_spec    critical  2h ago  JWT token format unclear
ISS-002    TASK-007   missing_detail    major     5h ago  Database migration order unspecified
ISS-003    TASK-012   schema_mismatch   minor     1d ago  Response type conflicts with OpenAPI

3 pending questions (1 critical, 1 major, 1 minor)
```

**Sort logic:** `severity` (default): critical > major > minor > suggestion, then timestamp desc. `timestamp`: newest first. `task`: grouped by task ID, severity within group.

**Auto-start behavior:** Matches `atsf query` -- reads `.atsf-issues.jsonl` directly if no server is running.

##### `atsf review answer` -- `src/commands/review/answer.ts`

```typescript
// Reference implementation
import { Args, Command, Flags } from '@oclif/core';

export default class ReviewAnswer extends Command {
  static override description = 'Answer a specific escalation question';

  static override args = {
    issueId: Args.string({
      description: 'Issue ID to answer (e.g., ISS-001)',
      required: true,
    }),
  };

  static override flags = {
    message: Flags.string({
      char: 'm', description: 'Answer text (inline). If omitted, opens $EDITOR',
    }),
    file: Flags.string({
      description: 'Read answer from a file',
    }),
    dismiss: Flags.boolean({
      char: 'd', description: 'Dismiss the question without answering', default: false,
    }),
    defer: Flags.boolean({
      description: 'Defer the question for later review', default: false,
    }),
    interactive: Flags.boolean({
      char: 'i', description: 'Walk through all pending questions one by one', default: false,
    }),
    output: Flags.string({
      char: 'o', description: 'Path to ATSF output directory', default: './atsf-output',
    }),
    port: Flags.integer({
      char: 'p', description: 'Port of running atsf serve instance', default: 4567,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(ReviewAnswer);
    // 1. Load issue by ID from server or JSONL
    // 2. Determine answer source: --message > --file > --dismiss > --defer > $EDITOR
    // 3. POST resolution to /api/review/:issueId (or write JSONL directly)
    // 4. Report result: answered/dismissed/deferred
  }
}
```

**Answer input priority:**
1. `--message "Use RS256"` -- inline quick answer
2. `--file answer.md` -- read from file
3. `--dismiss` -- mark as not-applicable
4. `--defer` -- postpone for later review
5. (none) -- open `$EDITOR` with pre-filled template (git-commit style)

**$EDITOR template:**
```
# Answering ISS-001: JWT token format unclear
# Task: TASK-003 (Implement authentication middleware)
# Severity: critical | Category: ambiguous_spec
#
# Original question:
# The spec says "use JWT" but doesn't specify HS256 vs RS256,
# token expiry, or refresh token behavior. What should I use?
#
# Write your answer below. Lines starting with # are ignored.
# Leave empty to abort.

```

**Interactive mode (`--interactive`):** Ink-based TUI walks through pending questions sequentially, showing full context and accepting `[a] Answer`, `[s] Skip`, `[d] Dismiss`, `[q] Quit` keybindings.

##### `atsf review export` / `atsf review import`

**Export (`src/commands/review/export.ts`):** Exports escalated issues as structured JSON for batch processing, web tool integration, or team workflows. Supports `--status` filter; defaults to stdout.

**Import (`src/commands/review/import.ts`):** Imports bulk answers from a JSON file. Supports `--dry-run` to preview changes before applying. Reports: N answered, M skipped, K failed.

```typescript
// Contract: implement exactly as specified
// Export file format
interface EscalationExportFile {
  readonly version: '1.0.0';
  readonly exportedAt: string;
  readonly issues: ReadonlyArray<{
    issueId: string;
    taskId: string;
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    category: string;
    summary: string;
    description: string;
    status: 'pending' | 'answered' | 'dismissed' | 'deferred';
  }>;
}

// Import file format
interface EscalationAnswerImportFile {
  readonly version: '1.0.0';
  readonly answers: ReadonlyArray<{
    issueId: string;
    action: 'answer' | 'dismiss' | 'defer';
    text?: string;
    answeredBy: string;
  }>;
}
```

> Source: Escalation design (cmd-agent, cross-examined by schema-agent and flow-agent).

### 3.4 Configuration: cosmiconfig + Zod

Configuration loading uses `cosmiconfig` v9.0.0 with `cosmiconfig-typescript-loader` v6.2.0 for TypeScript config file support. The loaded configuration is validated through a Zod v4 schema.

**Supported config file locations** (cosmiconfig search order):
- `atsf.config.ts`
- `atsf.config.js`
- `atsf.config.json`
- `.atsfrc.json`
- `.atsfrc.yaml`
- `package.json` (`atsf` key)

```typescript
// Contract: implement exactly as specified
import { z } from 'zod';

const ATSFConfigSchema = z.object({
  provider: z.object({
    default: z.enum(['openrouter', 'claude-code']).default('openrouter'),
    openrouter: z.object({
      apiKey: z.string().optional(),  // falls back to OPENROUTER_API_KEY env
      defaultModel: z.string().default('anthropic/claude-sonnet-4'),
    }).optional(),
    claudeCode: z.object({
      binaryPath: z.string().default('claude'),
      maxTurns: z.number().int().min(1).default(5),
    }).optional(),
  }),
  debate: z.object({
    rounds: z.number().int().min(1).max(10).default(3),  // rounds=1: no convergence check, judge decides immediately
    engine: z.enum(['round-robin', 'judge']).default('judge'),
    convergenceThreshold: z.number().min(0).max(1).default(0.8),
  }).default({}),
  build: z.object({
    maxConcurrency: z.number().int().min(1).max(50).default(5),
    timeout: z.number().int().min(1000).default(300_000),  // 5 minutes
  }).default({}),
  gate: z.object({
    threshold: z.number().min(0).max(1).default(0.8),
    autoFix: z.boolean().default(true),
    maxFixRounds: z.number().int().min(0).max(10).default(3),
    reporter: z.enum(['console', 'json', 'markdown', 'junit']).default('console'),
    gates: z.record(z.string(), z.object({
      enabled: z.boolean().default(true),
      threshold: z.number().min(0).max(1).optional(),
      autoFix: z.boolean().optional(),
      rules: z.record(z.string(), z.object({
        enabled: z.boolean().default(true),
        severity: z.enum(['error', 'warning', 'info']).optional(),
      })).optional(),
    })).default({}),
    custom: z.array(z.any()).default([]),  // Custom gate plugins (see Section 7.8)
  }).default({}),
  budget: z.object({
    perRunUsd: z.number().positive().optional(),
    perDayUsd: z.number().positive().optional(),
    perMonthUsd: z.number().positive().optional(),
  }).default({}),
  output: z.object({
    directory: z.string().default('./atsf-output'),
    // See ArtifactType in Section 10.6 for the canonical list. manifest is excluded here
    // because it is always generated as the final step and cannot be opted out of.
    formats: z.array(z.enum([
      'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
    ])).default(['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack']),
  }).default({}),
  serve: z.object({
    port: z.number().int().min(1024).max(65535).default(4567),
    host: z.string().default('127.0.0.1'),
    cors: z.boolean().default(true),
    llmEnabled: z.boolean().default(true),
    queryModel: z.string().optional(),
    maxChunks: z.number().int().min(1).max(50).default(10),
    issueLogFile: z.string().default('.atsf-issues.jsonl'),
    watchDebounceMs: z.number().int().min(100).default(1000),
  }).default({}),
  review: z.object({
    editor: z.string().optional(),  // Override $EDITOR for atsf review answer
    autoOpenEditor: z.boolean().default(true),
    defaultSort: z.enum(['severity', 'timestamp', 'task']).default('severity'),
    pageSize: z.number().int().min(5).max(100).default(25),
  }).default({}),
});

type ATSFConfig = z.infer<typeof ATSFConfigSchema>;
```

> Source: Configuration system (Section 3.4); synthesis report V8 (cosmiconfig v9 verified).

### 3.5 UI: ora + ink

ATSF uses a two-tier UI approach, auto-detected by TTY availability:

| Mode | Library | When Used |
|------|---------|-----------|
| Simple | `ora` | Non-TTY environments (CI pipelines, piped output) |
| Rich | `ink` | Interactive terminals with TTY support |

The rich dashboard (ink) shows:
- Overall progress bar
- Per-task status (pending/running/completed/failed)
- Cost accumulator
- Elapsed time
- Provider health (circuit breaker states)

The simple mode (ora) shows:
- Spinner with current task name
- Completion/failure messages

> Source: CLI UI design (Section 3.5).

### 3.6 Logging: pino + pino-pretty

Structured logging uses `pino` with `pino-pretty` for human-readable development output. Three-tier strategy:

| Level | Purpose | Example |
|-------|---------|---------|
| `debug` | Internal state for developers | DAG node transitions, lock acquisitions |
| `info` | User-facing progress | "Task TASK-001 completed in 3.2s" |
| `error` | Failures requiring attention | Provider errors, budget exceeded |

All log entries include structured fields: `taskId`, `provider`, `eventType`, `durationMs`, `tokenUsage`.

```typescript
// Reference implementation
import pino from 'pino';

const logger = pino({
  level: process.env.ATSF_LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

> Source: Logging strategy (Section 3.6).

### 3.7 Testing with Vitest

ATSF uses `@oclif/test` v4 with Vitest:

```typescript
// Reference implementation
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    disableConsoleIntercept: true,  // Required for @oclif/test
  },
});

// test/commands/init.test.ts
import { runCommand } from '@oclif/test';
import { describe, expect, it } from 'vitest';

describe('init', () => {
  it('creates a config file with default provider', async () => {
    const { stdout } = await runCommand(['init', '--force'], {
      root: import.meta.dirname,
    });
    expect(stdout).toContain('Initialized ATSF project');
    expect(stdout).toContain('openrouter');
  });
});
```

> Source: cli-framework correction, testing examples.

---

## 4. Provider System

### 4.1 OpenRouter (Primary) via AI SDK v5

**CORRECTED from the original provider recommendation.**

The original provider design used `generateObject()` from the Vercel AI SDK for structured LLM output. However, AI SDK v6 (released July 2025) deprecated `generateObject()` in favor of `generateText()` with `Output.object()`. The AI SDK v6 correction document established that the OpenRouter provider (`@openrouter/ai-sdk-provider@2.2.3`) does **not yet support AI SDK v6** because it returns `LanguageModelV2` instead of the required `LanguageModelV3`.

**Decision: Pin to AI SDK v5 until OpenRouter ships v6 support.**

> **Assessment date: 2026-02-25.** Check [OpenRouterTeam/ai-sdk-provider#307](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/307) before starting implementation -- the provider may have shipped v6 support since this specification was written. If v6 support is available, skip directly to Section 4.3 (v6 Migration Path).

This is tracked in [OpenRouterTeam/ai-sdk-provider#307](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/307). The v5 API is stable, `generateObject()` works, and the OpenRouter provider is fully compatible.

```json
{
  "dependencies": {
    "ai": "^5.0.0",
    "@openrouter/ai-sdk-provider": "^2.2.3"
  }
}
```

> Source: ai-sdk-v6 correction document, Sections 1--2.

### 4.2 Structured Output with generateObject() (v5 API)

While pinned to v5, ATSF uses `generateObject()` for structured LLM output validated against Zod schemas:

```typescript
// Reference implementation
import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const TaskOutputSchema = z.object({
  id: z.string().regex(/^TASK-\d{3,}$/),
  name: z.string().describe('Human-readable task name'),
  status: z.enum(['pending', 'in_progress', 'done']),
  dependencies: z.array(z.string()),
  filesWrite: z.array(z.string()),
  filesRead: z.array(z.string()),
});

const { object } = await generateObject({
  model: openrouter('anthropic/claude-sonnet-4'),
  schema: TaskOutputSchema,
  prompt: 'Decompose this feature into tasks...',
});
```

### 4.3 v6 Migration Path

When the OpenRouter provider ships v6 support (expected as `@openrouter/ai-sdk-provider@3.x`), ATSF will migrate using these API changes:

```typescript
// Illustrative — adapt to your implementation
// v6 pattern (FUTURE -- do NOT use until OpenRouter provider supports it)
import { generateText, Output } from 'ai';

const result = await generateText({
  model: openrouter('anthropic/claude-sonnet-4'),
  output: Output.object({
    schema: TaskOutputSchema,
  }),
  prompt: 'Decompose this feature into tasks...',
});

console.log(result.object);  // Typed output
```

Additional v6 changes:
- `maxSteps` replaced by `stopWhen(stepCountIs(n))`
- `CoreMessage` type replaced by `ModelMessage`
- `system` parameter renamed to `instructions`
- `strictJsonSchema` enabled by default

**Interim workaround (Option B):** If ATSF must adopt v6 before the native provider catches up, use `@ai-sdk/openai-compatible`:

```typescript
// Illustrative — adapt to your implementation
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  },
});
```

**Warning:** This loses OpenRouter-specific features (Response Healing plugin, BYOK usage accounting, web search engine option).

**Migration tool:** Run `npx @ai-sdk/codemod v6` for automated v5-to-v6 migration.

> Source: ai-sdk-v6 correction document, Sections 1--8.

### 4.4 Claude Code CLI Provider

For the "builder" agent role, ATSF uses the Claude Code CLI in non-interactive (print) mode:

```bash
# Basic structured JSON output
claude -p "your prompt" --output-format json

# Streaming JSON (NDJSON) for pipeline chaining
claude -p "your prompt" --output-format stream-json
```

**Verified flags:**
- `-p` / `--print`: Non-interactive mode, exits after response
- `--output-format json|stream-json|text`: Output format
- `--input-format stream-json`: Accept NDJSON input stream for pipeline chaining
- `--max-turns N`: Limit conversation turns
- `--system-prompt "..."`: Replace default system prompt
- `--append-system-prompt "..."`: Add to default system prompt
- `--model MODEL_ID`: Select specific model

**Stream chaining pattern:** Multiple Claude Code invocations can be piped together using `--output-format stream-json` and `--input-format stream-json`. Each agent processes the upstream output and passes structured results downstream:

```bash
claude -p --output-format stream-json "First task" \
  | claude -p --input-format stream-json --output-format stream-json "Process results" \
  | claude -p --input-format stream-json "Final report"
```

This pattern enables ATSF to compose multi-step Claude Code agent pipelines where each stage receives the full structured output of the previous stage as NDJSON input.

The ClaudeCodeProvider adapter uses `child_process.spawn` to invoke the CLI:

```typescript
// Reference implementation
import { spawn } from 'node:child_process';

class ClaudeCodeProvider implements ProviderAdapter {
  readonly id = 'claude-code';
  readonly name = 'Claude Code CLI';
  readonly supportedModels = ['claude-sonnet-4', 'claude-opus-4'];

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const child = spawn('claude', [
      '-p', request.prompt,
      '--output-format', 'json',
      ...(request.systemPrompt ? ['--system-prompt', request.systemPrompt] : []),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],  // Close stdin to prevent hanging in non-TTY
    });

    // Propagate AbortSignal to kill the child process
    if (request.signal) {
      const onAbort = () => {
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
      };
      request.signal.addEventListener('abort', onAbort, { once: true });
      child.on('exit', () => request.signal!.removeEventListener('abort', onAbort));
    }

    const [output, stderr] = await Promise.all([
      collectStdout(child),
      collectStderr(child),
    ]);

    if (child.exitCode !== 0) {
      throw new Error(`Claude Code CLI exited with code ${child.exitCode}: ${stderr}`);
    }

    const parsed = JSON.parse(output);

    return {
      content: parsed.result,
      model: 'claude-code',
      finishReason: 'stop',
      usage: {
        // Claude Code CLI JSON output includes cost_usd but not raw token counts.
        // Extract from parsed.usage if available; fall back to zero.
        promptTokens: parsed.usage?.input_tokens ?? 0,
        completionTokens: parsed.usage?.output_tokens ?? 0,
        totalTokens: (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0),
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const child = spawn('claude', ['--version']);
      const output = await collectStdout(child);
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }
}
```

> Source: Provider system (Section 4); ai-sdk-v6 correction Section 6 (verified CLI flags).

### 4.5 Rate Limiting and Cost Tracking

Rate limiting and cost tracking are handled by the unified resilience layer (see Section 9.4). **Provider adapters do NOT wrap their own calls in resilience.** Callers (DebateEngine, TaskExecutor, GatePlugin) manage resilience externally:

```typescript
// Reference implementation
class OpenRouterProvider implements ProviderAdapter {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly supportedModels = ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4'];

  constructor(
    private openrouter: ReturnType<typeof createOpenRouter>
  ) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await generateObject({
      model: this.openrouter(request.model),
      schema: request.schema,
      prompt: request.prompt,
    });
    return {
      content: JSON.stringify(response.object),
      object: response.object,
      model: request.model,
      finishReason: response.finishReason ?? 'stop',
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Lightweight models endpoint check via OpenRouter API
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**Callers** then wrap via resilience (see Section 6.8.3 for debate, Section 7.6.1 for gates):

The resilience pipeline order is:
1. **CostTracker.check()** -- Reject if budget exhausted
2. **CircuitBreaker.check()** -- Reject if provider is known-down
3. **RateLimiter.acquire()** -- Wait for token bucket
4. **Semaphore.acquire()** -- Wait for provider concurrency slot
5. **Provider call** -- Actual LLM request
6. **On success:** Record cost, update circuit breaker and adaptive concurrency
7. **On failure:** Update circuit breaker and adaptive concurrency

> Source: Resilience layer (Section 9.4); dag-events-resilience correction Section 3.

---

## 5. Task Graph & DAG

### 5.1 Unified DAG Module

**CORRECTED from the original separate static and runtime DAG implementations.**

The synthesis report identified overlapping DAG/scheduler implementations (contradiction C2) and dual file locking systems (contradiction C3). The dag-events-resilience correction consolidates these into a single module with two layers:

```
src/dag/
  types.ts              # Shared interfaces (the handoff contract)
  static/               # Graph analysis layer
    graph-builder.ts    # Construction from YAML
    validator.ts        # DFS 3-color cycle detection
    conflict-detector.ts # micromatch file conflict detection
    topological-sort.ts # THE ONLY Kahn's implementation
  runtime/              # Execution layer
    scheduler.ts        # DAGScheduler (consumes TaskGraph.layers)
    executor.ts         # Task dispatch via resilience layer
    file-lock-manager.ts # In-memory lock enforcement
    monitor.ts          # Progress snapshots
```

**Key principle:** Kahn's algorithm exists exactly once in `static/topological-sort.ts`. The runtime scheduler consumes its output.

> Source: dag-events-resilience correction Section 1.

### 5.2 Static Layer: Graph Construction and Validation

The static layer operates on task definitions before any execution begins. It answers: "Is this task graph valid, and what is the execution order?"

#### 5.2.1 GraphBuilder

Parses YAML task definitions into `TaskNode[]` and `TaskEdge[]`, builds adjacency lists, and returns a validated `TaskGraph`.

```typescript
// Contract: implement exactly as specified
interface GraphBuilder {
  /**
   * Construct, validate, detect conflicts, sort, and return a TaskGraph.
   * Throws if validation fails (cycles, missing deps, etc.).
   */
  build(tasks: readonly RawTaskDefinition[]): TaskGraph;
}

interface RawTaskDefinition {
  readonly id: TaskId;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly agent: string;
  readonly dependsOn: readonly TaskId[];
  readonly filesRead: readonly string[];   // glob patterns
  readonly filesWrite: readonly string[];  // glob patterns
  readonly priority?: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * A validated task node within the DAG.
 * Extends RawTaskDefinition with computed properties from GraphBuilder.
 * Used by the runtime scheduler and all static analysis functions.
 *
 * Source: Task graph & DAG (Section 5); dag-events-resilience correction Section 1.
 */
interface TaskNode extends RawTaskDefinition {
  // Computed by GraphBuilder (not present in RawTaskDefinition)
  readonly layer: number;               // topological layer index
  readonly fileConflicts: readonly TaskId[];  // tasks that conflict on file writes
}

> **Mapping:** `GraphBuilder.build()` constructs `TaskNode` from `RawTaskDefinition` by copying all input fields and computing `layer` (from topological sort) and `fileConflicts` (from ConflictDetector). No field renaming or lossy transformation occurs.

/**
 * A directed edge in the task DAG.
 * 'dependency' edges encode task ordering (dependsOn).
 * 'file_conflict' edges encode file-level mutual exclusion constraints
 * detected by the ConflictDetector.
 */
interface TaskEdge {
  readonly from: TaskId;
  readonly to: TaskId;
  readonly type: 'dependency' | 'file_conflict';
}
```

#### 5.2.2 Validator (DFS 3-Color Cycle Detection)

Uses DFS with three-color marking (white/gray/black) for cycle detection. This algorithm provides human-readable error paths showing exactly which tasks form the cycle.

```typescript
// Contract: implement exactly as specified
interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

interface ValidationError {
  readonly code: 'CYCLE_DETECTED' | 'MISSING_DEPENDENCY' | 'SELF_LOOP' | 'DUPLICATE_TASK_ID';
  readonly message: string;
  readonly taskIds: readonly TaskId[];
  readonly cyclePath?: readonly TaskId[];  // for CYCLE_DETECTED
}

interface ValidationWarning {
  readonly code: 'ORPHAN_TASK' | 'DEEP_DEPENDENCY_CHAIN' | 'WIDE_WRITE_GLOB';
  readonly message: string;
  readonly taskIds: readonly TaskId[];
}
```

The DFS approach was chosen over Kahn's for cycle detection specifically because it produces cycle paths (e.g., "A -> B -> C -> A"). Kahn's algorithm detects cycles (leftover nodes with non-zero in-degree) but cannot report the cycle path.

> Source: Task graph & DAG (Section 5); buildability gate uses the same DFS approach (Section 7).

#### 5.2.3 ConflictDetector (micromatch Glob Overlap)

Expands `filesWrite` and `filesRead` glob patterns using micromatch, builds a conflict matrix, and identifies tasks that cannot run concurrently due to write-write or read-write conflicts.

```typescript
// Contract: implement exactly as specified
interface FileConflict {
  readonly taskA: TaskId;
  readonly taskB: TaskId;
  readonly pattern: string;       // the overlapping glob/path
  readonly reason: 'write-write' | 'read-write';
}

interface ConflictDetector {
  detect(
    nodes: ReadonlyMap<TaskId, TaskNode>,
    workspaceRoot: string
  ): readonly FileConflict[];
}
```

Readers-writer lock semantics: multiple concurrent reads are allowed, but writes conflict with both reads and other writes.

**Candidate file discovery:** `ConflictDetector.detect()` receives `workspaceRoot` and uses the `filesWrite`/`filesRead` glob patterns from each `TaskNode` directly -- it does NOT scan the filesystem. Instead, it expands globs using `micromatch.match()` against the **union of all `filesWrite` and `filesRead` patterns across all tasks** as candidate paths. This is a pure string-level overlap check: if Task A writes `src/**/*.ts` and Task B writes `src/auth/*.ts`, micromatch detects the pattern overlap without needing actual files on disk. At specification time, no real filesystem exists.

> Source: Task graph & DAG (Section 5); parallel execution layer (Section 9); dag-events-resilience correction Section 4.6.

#### 5.2.4 Topological Sort (Single Kahn's Implementation)

```typescript
// Contract: implement exactly as specified
/**
 * THE ONLY implementation of Kahn's algorithm in ATSF.
 * Returns tasks grouped into topological layers (tasks at the same depth
 * that can run concurrently, subject to file conflict constraints).
 */
type TopologicalSortFn = (
  nodes: ReadonlyMap<TaskId, TaskNode>,
  edges: readonly TaskEdge[]
) => readonly TopologicalLayer[];

interface TopologicalLayer {
  readonly depth: number;
  readonly taskIds: readonly TaskId[];
}
```

**Layer Assignment Algorithm (Kahn's with depth tracking):**

1. Compute `inDegree[node]` for each node, counting only `dependency` edges (NOT `file_conflict` edges). File conflict edges are handled at runtime by FileLockManager, not at layer assignment time.
2. Initialize a queue with all nodes where `inDegree == 0`. These form **Layer 0** (`depth = 0`).
3. For each node dequeued, decrement `inDegree` of its successors (along dependency edges only). When a successor's `inDegree` reaches 0, add it to the **next layer** (`depth = current_depth + 1`).
4. Repeat until queue is empty.
5. If any node was not visited, the graph contains a cycle (this should never happen if DFS validation passed).

**Tie-breaking:** Tasks within the same layer are unordered (no priority-based ordering). The runtime scheduler (Section 9.1) dispatches all tasks in a layer concurrently; p-queue handles actual execution ordering based on its internal FIFO.

```
// Illustrative — adapt to your implementation
function kahnTopologicalSort(nodes, edges):
  inDegree = Map<TaskId, number> initialized to 0 for all nodes
  for each edge where edge.type === 'dependency':
    inDegree[edge.to] += 1

  layers = []
  currentLayer = [n for n in nodes where inDegree[n] === 0]
  depth = 0

  while currentLayer is not empty:
    layers.push({ depth, taskIds: currentLayer })
    nextLayer = []
    for each nodeId in currentLayer:
      for each edge where edge.from === nodeId and edge.type === 'dependency':
        inDegree[edge.to] -= 1
        if inDegree[edge.to] === 0:
          nextLayer.push(edge.to)
    currentLayer = nextLayer
    depth += 1

  return layers
```

> Source: Task graph & DAG (Section 5); dag-events-resilience correction Section 1.4.

#### 5.2.5 Critical Path Computation

The **critical path** is the longest dependency chain in the unweighted DAG. It determines the minimum number of sequential execution steps regardless of parallelism and is used for progress estimation and MPD output.

**Algorithm:**

1. Identify all **sink nodes** (nodes with no outgoing dependency edges, i.e., no other task depends on them).
2. Perform a **reverse BFS** from each sink node, traversing dependency edges backward.
3. For each node, compute `dist[node] = max(dist[successor] + 1)` for all successors along dependency edges. Sink nodes have `dist = 0`.
4. The node with the maximum `dist` value is the **start of the critical path**.
5. Reconstruct the path by following the successor with the highest `dist` at each step.

**Complexity:** O(V + E) where V is the number of tasks and E is the number of dependency edges.

**Usage:**
- **Progress estimation:** The critical path length provides a lower bound on total execution steps, used by the `monitor.ts` module to report meaningful progress percentages.
- **MPD output:** The Master Planning Document includes the critical path as a highlighted sequence, showing stakeholders which tasks are on the critical timeline.
- **Stored in `TaskGraph.criticalPath`** as a `readonly TaskId[]` ordered from first to last task in the chain.

```typescript
// Contract: implement exactly as specified
type CriticalPathFn = (
  nodes: ReadonlyMap<TaskId, TaskNode>,
  edges: readonly TaskEdge[]
) => readonly TaskId[];
```

> Source: Task graph & DAG (Section 5); dag-events-resilience correction Section 1.

#### 5.2.6 Path Normalization

All file paths within ATSF MUST be normalized to POSIX-style forward slashes before storage, comparison, or glob matching. Normalization is applied at the system boundary:
- `GraphBuilder.build()` normalizes `RawTaskDefinition.filesRead/filesWrite` on input
- `FileLockManager` normalizes paths before lock comparison
- `ConflictDetector` normalizes before micromatch calls

```typescript
// Contract: implement exactly as specified
function normalizePath(p: string): string {
  return p.split(path.sep).join('/').toLowerCase();
}
```

> **Note:** The `.toLowerCase()` ensures case-insensitive comparison on macOS/Windows. On case-sensitive Linux filesystems, this is conservative (treats `A.ts` and `a.ts` as the same file) but safe.

### 5.3 TaskGraph: The Handoff

The validated, immutable output of the static layer. The runtime layer consumes this and never modifies graph structure -- it only tracks execution state.

```typescript
// Contract: implement exactly as specified
interface TaskGraph {
  readonly nodes: ReadonlyMap<TaskId, TaskNode>;
  readonly edges: readonly TaskEdge[];
  readonly layers: readonly TopologicalLayer[];
  readonly fileConflicts: readonly FileConflict[];
  readonly criticalPath: readonly TaskId[];   // longest dependency chain
}
```

### 5.4 YAML Schema

Task graphs are defined in YAML with `filesWrite`/`filesRead` separation:

```yaml
# task_graph.yaml
version: "1.0"
project:
  name: "SaaS CRM MVP"
  description: "Customer relationship management platform"

tasks:
  - id: TASK-001
    name: "Define database schema"
    agent: planner
    dependsOn: []
    filesWrite:
      - "docs/database-schema.yaml"
      - "docs/erd.md"
    filesRead:
      - "requirements.md"
    priority: 5
    metadata:
      estimatedTokens: 2000
      category: architecture

  - id: TASK-002
    name: "Design API endpoints"
    agent: planner
    dependsOn: [TASK-001]
    filesWrite:
      - "docs/api-spec.yaml"
    filesRead:
      - "docs/database-schema.yaml"
      - "requirements.md"
    priority: 4

  - id: TASK-003
    name: "Define auth strategy"
    agent: critic
    dependsOn: [TASK-001]
    filesWrite:
      - "docs/auth-strategy.md"
    filesRead:
      - "docs/database-schema.yaml"
    priority: 4

  - id: TASK-004
    name: "Review and debate API design"
    agent: judge
    dependsOn: [TASK-002, TASK-003]
    filesWrite:
      - "decisions/api-design-adr.md"
    filesRead:
      - "docs/api-spec.yaml"
      - "docs/auth-strategy.md"
    priority: 3
```

### 5.5 File Lock Detection via micromatch

File conflict detection uses `micromatch` for glob pattern overlap analysis. The conflict matrix is computed once at build time by the static layer and stored in `TaskGraph.fileConflicts`. The runtime layer uses this pre-computed data -- it never re-analyzes file conflicts.

This ensures the static and runtime layers always agree on which tasks conflict (resolving synthesis report contradiction C3).

```typescript
// Reference implementation
import micromatch from 'micromatch';

function detectGlobOverlap(
  globsA: readonly string[],
  globsB: readonly string[],
  candidateFiles: readonly string[]
): string[] {
  const matchesA = new Set(micromatch(candidateFiles, globsA));
  const matchesB = new Set(micromatch(candidateFiles, globsB));
  return [...matchesA].filter(f => matchesB.has(f));
}
```

### 5.6 dependency-graph NPM Package

ATSF uses `dependency-graph` v1.0.0 as a base for graph operations, extended with custom logic (~500-800 LOC) for file conflict detection, topological layer grouping, and critical path analysis.

The package is feature-complete for basic graph operations (cycle detection, topological sorting, transitive dependency resolution) but has not been updated in ~2 years. The team should be prepared to maintain a fork or inline the ~200 LOC of relevant logic if maintenance becomes a concern.

> Source: Task graph & DAG dependencies (Section 5); synthesis report V7 (verified existence, noted staleness).

---

## 6. Debate Engine

### 6.1 Three-Round Structure

The debate engine implements a structured 3-round multi-agent debate protocol derived from academic research (AutoGen, CAMEL, ChatDev, LLM-Debate by Du et al.):

| Round | Name | Activity |
|-------|------|----------|
| 1 | **Proposals** | Each proposer agent generates an independent solution to the architectural question |
| 2 | **Cross-Examination** | Critic agents examine each proposal, identifying strengths, weaknesses, and contradictions |
| 3 | **Decision + ADR** | A judge agent synthesizes all proposals and critiques into a final decision with rationale |

> Source: Debate engine (Section 6).

### 6.2 Judge-Agent Pattern

ATSF uses the judge-agent pattern for Round 3 synthesis (recommended over a simple voting approach). The judge receives all proposals and all critiques, then produces:
- A single chosen option with rationale
- An Architecture Decision Record (ADR)
- A consensus score (0.0-1.0)
- A confidence score (0.0-1.0)

```typescript
// Contract: implement exactly as specified
interface DebateConfig {
  readonly topic: string;
  readonly context: string;
  readonly proposerCount: number;       // typically 2-3
  readonly rounds: number;              // default 3; controls how many debate cycles run
  readonly convergenceThreshold: number; // 0.0-1.0
  /** Model identifier for debate LLM calls. Defaults to provider's default model if omitted. */
  readonly model?: string;
}

interface Proposal {
  readonly agentId: string;
  readonly option: string;
  readonly rationale: string;
  readonly tradeoffs: readonly string[];
  readonly evidence: readonly string[];
}

interface Critique {
  readonly agentId: string;
  readonly targetProposal: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly questions: readonly string[];
}

interface Decision {
  readonly chosenOption: string;
  readonly rationale: string;
  readonly consensusScore: number;
  readonly confidenceScore: number;
  readonly dissent: readonly Array<{ agent: string; position: string; reason: string }>;  // structured dissent, matches MADRv4Data.dissent (Section 6.5)
  readonly requiresHumanReview: boolean; // true when convergenceScore < 0.5
  readonly convergenceAchieved: boolean; // whether debate converged within configured rounds
}
```

> Source: Debate engine (Section 6); design verification (debate-conv agent).

### 6.3 MADR v4.0 Format

**CORRECTED from the original MADR v3.0 reference.**

ATSF generates Architecture Decision Records conforming to **MADR v4.0.0** (released September 2024). Key changes from v3:

| v3 Field/Section | v4 Correction |
|------------------|---------------|
| `deciders:` (YAML front matter) | Renamed to `decision-makers:` |
| `## Validation` (top-level section) | Renamed to `### Confirmation` (subsection under Decision Outcome) |
| "Markdown Any Decision Record" | Reverted to "Markdown Architectural Decision Record" |
| Placeholder `{placeholder}` | Changed to `<!-- placeholder -->` in bare templates |
| `status:` unquoted | Now quoted: `status: "proposed"` |

ATSF uses the `adr-template-bare.md` variant (all sections, no verbose annotations) as the base. The Eta template engine fills in content from debate output.

> Source: eta-madr-update correction Part 2.

### 6.4 MADR v4 Eta Template

```eta
---
status: "<%= it.status || 'proposed' %>"
date: "<%= it.date || new Date().toISOString().split('T')[0] %>"
decision-makers: <%= it.decisionMakers || '' %>
consulted: <%= it.consulted || '' %>
informed: <%= it.informed || '' %>
---

# <%= it.title %>

## Context and Problem Statement

<%= it.context %>

<% if (it.decisionDrivers && it.decisionDrivers.length) { %>
## Decision Drivers

<% it.decisionDrivers.forEach(function(driver) { %>
* <%= driver %>
<% }) %>
<% } %>

## Considered Options

<% it.options.forEach(function(option) { %>
* <%= option.name %>
<% }) %>

## Decision Outcome

Chosen option: "<%= it.chosenOption %>", because <%= it.rationale %>

### Consequences

<% if (it.consequences) { %>
<% it.consequences.filter(c => c.type === 'good').forEach(function(c) { %>
* Good, because <%= c.description %>
<% }) %>
<% it.consequences.filter(c => c.type === 'bad').forEach(function(c) { %>
* Bad, because <%= c.description %>
<% }) %>
<% } %>

### Confirmation

<%= it.confirmation || '' %>

## Pros and Cons of the Options

<% it.options.forEach(function(option) { %>
### <%= option.name %>

<%= option.description || '' %>

<% if (option.pros) { option.pros.forEach(function(pro) { %>
* Good, because <%= pro %>
<% }) } %>
<% if (option.neutral) { option.neutral.forEach(function(n) { %>
* Neutral, because <%= n %>
<% }) } %>
<% if (option.cons) { option.cons.forEach(function(con) { %>
* Bad, because <%= con %>
<% }) } %>

<% }) %>

<% if (it.dissent && it.dissent.length > 0) { %>
### Dissenting Views

<% for (const d of it.dissent) { %>
- **<%= d.agent %>**: <%= d.position %> -- <%= d.reason %>
<% } %>
<% } %>

<% if (it.moreInformation) { %>
## More Information

<%= it.moreInformation %>
<% } %>
```

### 6.5 MADR v4 Data Interface

```typescript
// Contract: implement exactly as specified
interface MADRv4Data {
  // YAML front matter
  status: 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';
  date: string;                     // YYYY-MM-DD
  decisionMakers: string;           // CORRECTED: was "deciders" in v3
  consulted?: string;
  informed?: string;

  // Content
  title: string;
  context: string;
  decisionDrivers?: string[];
  options: Array<{
    name: string;
    description?: string;
    pros?: string[];
    neutral?: string[];
    cons?: string[];
  }>;
  chosenOption: string;
  rationale: string;
  consequences?: Array<{
    type: 'good' | 'bad';
    description: string;
  }>;
  confirmation?: string;            // CORRECTED: was "validation" in v3
  moreInformation?: string;

  // ATSF extensions (beyond standard MADR)
  debateRef?: string;               // Link to debate session
  consensusScore?: number;          // 0.0-1.0
  confidenceScore?: number;         // 0.0-1.0
  dissent?: Array<{ agent: string; position: string; reason: string }>;
  requiresHumanReview?: boolean;    // true when convergenceScore < 0.5
  convergenceAchieved?: boolean;    // whether debate converged within configured rounds
}
```

> Source: Debate engine (Section 6); eta-madr-update correction Part 2 (MADR v4 corrections).

### 6.6 Convergence Detection

The debate engine detects convergence to prevent unnecessary rounds:

```typescript
// Contract: implement exactly as specified
interface ConvergenceResult {
  readonly converged: boolean;
  readonly score: number;           // 0.0-1.0
  readonly overlappingCriteria: readonly string[];
  readonly divergentCriteria: readonly string[];
  readonly roundMetrics: readonly RoundMetric[];
}

interface RoundMetric {
  readonly round: number;
  readonly optionAgreement: number;    // 0.0-1.0 plurality ratio (maxCount / proposals.length)
  readonly critiqueOverlap: number;    // 0.0-1.0 ratio of repeated vs new concerns
  readonly tokenUsage: number;         // tokens consumed in this round
}
```

#### 6.6.1 Formal Convergence Algorithm

Convergence is measured after each round using a weighted composite score:

```
convergenceScore = 0.6 * optionAgreement + 0.4 * critiqueOverlap
```

**Pseudocode:**

```
function detectConvergence(proposals[], critiques[], config):
  // Step 1: Option Agreement (plurality ratio)
  // Measures the fraction of proposers who agree on the most-popular option.
  // This is a plurality ratio (maxCount / total), NOT Jaccard similarity.
  // Range: 1/N (complete disagreement) to 1.0 (unanimous agreement).
  optionSets = proposals.map(p => p.option)
  uniqueOptions = unique(optionSets)
  if uniqueOptions.length == 1:
    optionAgreement = 1.0
  else:
    // Count most-popular option's share
    maxCount = max(count of each unique option)
    optionAgreement = maxCount / proposals.length

  // Step 2: Critique Overlap (new concerns ratio)
  if round == 1:
    critiqueOverlap = 0.0   // first round, all concerns are new
  else:
    previousConcerns = flatten(prevCritiques.map(c => c.weaknesses))
    currentConcerns = flatten(critiques.map(c => c.weaknesses))
    newConcerns = currentConcerns.filter(c => !fuzzyMatch(c, previousConcerns))
    critiqueOverlap = 1.0 - (newConcerns.length / max(currentConcerns.length, 1))

  // Step 3: Composite score
  score = 0.6 * optionAgreement + 0.4 * critiqueOverlap

  return {
    converged: score >= config.convergenceThreshold,
    score,
    overlappingCriteria: repeated concerns,
    divergentCriteria: newConcerns
  }
```

**`fuzzyMatch(concern, previousConcerns)` specification:**

The `fuzzyMatch` function determines whether a critique concern is semantically equivalent to any previously raised concern. It uses **BM25 text similarity** via `wink-bm25-text-search` (the same library used in Section 15 for artifact search), avoiding any additional dependencies.

```typescript
// Reference implementation
import BM25 from 'wink-bm25-text-search';

function fuzzyMatch(concern: string, previousConcerns: string[]): boolean {
  if (previousConcerns.length === 0) return false;

  const engine = BM25();
  engine.defineConfig({ fldWeights: { text: 1 } });
  previousConcerns.forEach((c, i) => engine.addDoc({ text: c }, i));
  engine.consolidate();

  const results = engine.search(concern);
  // A BM25 similarity score > 0.6 means the concern is substantially
  // the same as a previously raised concern ("same concern" threshold).
  return results.length > 0 && results[0][1] > 0.6;
}
```

**Rationale:** BM25 is effective for matching technical critiques because they share domain-specific vocabulary. The 0.6 threshold was chosen to be permissive enough to catch rephrasings ("lacks horizontal scaling" vs "no horizontal scalability") while avoiding false positives across genuinely different concerns. Reusing `wink-bm25-text-search` keeps the dependency footprint unchanged.

**Convergence is detected when:**
1. All proposals agree on the same option (optionAgreement = 1.0)
2. Critics raise no new concerns beyond those already addressed (critiqueOverlap >= 0.8)
3. The composite convergence score exceeds the configured threshold (default: 0.8)

> **Note on `rounds=1`:** When `rounds` is set to 1, convergence checking is effectively skipped because `critiqueOverlap` is always 0 in the first round (all concerns are new). With `rounds=1`, the debate runs a single cycle (Proposals + Cross-Examination + Decision) and the judge decides immediately without convergence gating. Set `rounds >= 2` for meaningful convergence detection.

#### 6.6.2 Fallback Strategy (Non-Convergence)

If convergence is not reached within the configured `rounds` (default: 3):

1. **Judge forced decision:** The judge agent receives all proposals and critiques and must produce a decision regardless of convergence. The ADR's `confirmation` field notes: "Decision made under non-convergence (score: X.XX). Dissenting views recorded below."
2. **Dissent recording:** All unresolved disagreements are captured in the `Decision.dissent` array and included in the ADR under a "### Dissenting Views" subsection.
3. **Confidence penalty:** The `confidenceScore` is automatically capped at `convergenceScore * 0.8` when convergence was not achieved, signaling downstream consumers to treat the decision with appropriate caution.
4. **Escalation flag:** A `requiresHumanReview: boolean` field is set to `true` when convergence score < 0.5, indicating the decision should be reviewed by a human architect.

```typescript
// Contract: implement exactly as specified
interface Decision {
  readonly chosenOption: string;
  readonly rationale: string;
  readonly consensusScore: number;
  readonly confidenceScore: number;
  readonly dissent: readonly Array<{ agent: string; position: string; reason: string }>;  // structured dissent, matches MADRv4Data.dissent (Section 6.5)
  readonly requiresHumanReview: boolean; // true when convergenceScore < 0.5
  readonly convergenceAchieved: boolean; // whether debate converged within configured rounds
}
```

#### 6.6.3 Token Budget

Estimated token budget per debate session (3 rounds, 2 proposers, 1 critic, 1 judge):

| Phase | Input Tokens | Output Tokens | Subtotal |
|-------|-------------|---------------|----------|
| Round 1: 2 Proposals | ~2,000 context each | ~1,500 each | ~7,000 |
| Round 2: 2 Critiques | ~5,000 context each | ~1,000 each | ~12,000 |
| Round 3: Judge synthesis | ~10,000 context | ~2,000 | ~12,000 |
| **Total per debate** | | | **~31,000 tokens** |

With `gpt-4o-mini` at ~$0.15/1M input + $0.60/1M output, each debate costs approximately **$0.004**. With `claude-3.5-sonnet`, approximately **$0.06**. These estimates scale linearly with proposer count.

> Source: Design verification (debate-conv agent, cross-examined by bm25 and lockman agents).

### 6.7 Storage: Dual Format

Debate outputs are stored in two formats:
- **Markdown** (human-readable): ADR files in MADR v4 format
- **YAML** (machine-readable): Structured debate data for programmatic consumption

```yaml
# decisions/001-database-selection.yaml
debateId: "DB-001"
topic: "Database Selection for SaaS CRM"
rounds: 3
convergenceScore: 0.85
decision:
  chosenOption: "PostgreSQL"
  rationale: "Mature, ACID-compliant, excellent TypeScript support via Prisma"
proposals:
  - agentId: proposer-1
    option: PostgreSQL
    # ...
  - agentId: proposer-2
    option: MongoDB
    # ...
critiques:
  - agentId: critic-1
    # ...
adrPath: "decisions/001-database-selection.md"
```

> Source: Debate engine storage design (Section 6).

### 6.8 Provider Integration

The debate engine requires LLM calls for proposals, critiques, and judge synthesis. All LLM interactions go through the `ProviderAdapter` (Section 2.3.1) via `ResilienceLayer` (Section 9.4), following the same pattern used by quality gates and task execution.

#### 6.8.1 DebateEngine Construction

```typescript
// Reference implementation
class DebateEngine {
  constructor(
    private readonly provider: ProviderAdapter,
    private readonly resilience: ResilienceLayer,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Factory method used by OrchestratorEngine to create a DebateEngine
   * with the same provider and resilience layer used by the rest of the pipeline.
   */
  static create(
    provider: ProviderAdapter,
    resilience: ResilienceLayer,
    eventBus: EventBus,
  ): DebateEngine {
    return new DebateEngine(provider, resilience, eventBus);
  }

  async runDebate(config: DebateConfig): Promise<Decision> {
    // See 6.8.2 for per-round call flow
  }
}
```

#### 6.8.2 Debate Prompt Templates

The debate engine uses three role-specific system prompts and three prompt builder functions. System prompts are Eta templates loaded from `src/agents/prompts/debate/`:

```typescript
// Contract: implement exactly as specified
/**
 * Debate prompt template files:
 *   src/agents/prompts/debate/proposer-system.eta
 *   src/agents/prompts/debate/critic-system.eta
 *   src/agents/prompts/debate/judge-system.eta
 *
 * Each template receives the DebateConfig as its template context.
 */
interface DebatePromptTemplates {
  readonly PROPOSER_SYSTEM_PROMPT: string;  // "You are a technical architect proposing a solution..."
  readonly CRITIC_SYSTEM_PROMPT: string;    // "You are a critical reviewer examining proposals..."
  readonly JUDGE_SYSTEM_PROMPT: string;     // "You are a senior architect synthesizing a final decision..."
}

/** Prompt builder functions -- these construct the user-facing prompt for each round. */
type BuildProposerPrompt = (topic: string, context: string) => string;
type BuildCritiquePrompt = (proposal: Proposal, allProposals: readonly Proposal[]) => string;
type BuildJudgePrompt = (topic: string, proposals: readonly Proposal[], critiques: readonly Critique[]) => string;
```

System prompt content is implementation-time work (the actual wording depends on the target LLM's strengths). The templates MUST include: (1) role identity, (2) output schema reminder (Zod-validated), (3) evaluation criteria matching the gate system. Prompt files are `.eta` templates so they can interpolate `DebateConfig` fields (e.g., `<%= it.topic %>`).

#### 6.8.3 Per-Round Provider Calls

Each debate round issues LLM calls through the resilience layer:

```typescript
// Reference implementation
// Round 1: Proposals -- one call per proposer
for (const i of range(config.proposerCount)) {
  const proposal = await this.resilience.execute(
    this.provider.id,
    async () => {
      const start = Date.now();
      const response = await this.provider.generate({
        model: config.model ?? 'anthropic/claude-sonnet-4',
        systemPrompt: PROPOSER_SYSTEM_PROMPT,
        prompt: buildProposerPrompt(config.topic, config.context),
        schema: ProposalSchema,       // Zod schema for structured output
      });
      return {
        value: response,
        tokenUsage: extractTokenUsage(response),
        latencyMs: Date.now() - start,
      };
    },
  );
  proposals.push(parseProposal(proposal, `proposer-${i}`));
}

// Round 2: Cross-Examination -- one call per proposal
for (const proposal of proposals) {
  const critique = await this.resilience.execute(
    this.provider.id,
    async () => {
      const start = Date.now();
      const response = await this.provider.generate({
        model: config.model ?? 'anthropic/claude-sonnet-4',
        systemPrompt: CRITIC_SYSTEM_PROMPT,
        prompt: buildCritiquePrompt(proposal, allProposals),
        schema: CritiqueSchema,
      });
      return {
        value: response,
        tokenUsage: extractTokenUsage(response),
        latencyMs: Date.now() - start,
      };
    },
  );
  critiques.push(parseCritique(critique, proposal.agentId));
}

// Round 3: Judge synthesis -- single call
const decision = await this.resilience.execute(
  this.provider.id,
  async () => {
    const start = Date.now();
    const response = await this.provider.generate({
      model: config.model ?? 'anthropic/claude-sonnet-4',
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      prompt: buildJudgePrompt(config.topic, proposals, critiques),
      schema: DebateDecisionSchema,  // distinct from AgentDecisionSchema (Section 8.2)
    });
    return {
      value: response,
      tokenUsage: extractTokenUsage(response),
      latencyMs: Date.now() - start,
    };
  },
);
```

This ensures all debate LLM calls pass through cost tracking, circuit breaking, rate limiting, and adaptive concurrency -- identical to how provider calls work in task execution and quality gates.

> Source: Debate-provider integration design (derived from Sections 4.5, 9.4).

---

## 7. Quality Gates

### 7.1 Plugin-Based Pipeline

The quality gate system uses a plugin-based architecture where each gate operates independently. All 5 gates run in parallel (they are logically independent), preceded by a structural parsing prerequisite phase.

```
Phase 0 (prerequisite): Structural parsing + Zod L1 validation
  |
Phase 1 (parallel):
  +-- Coverage Gate
  +-- Consistency Gate
  +-- Testability Gate
  +-- Buildability Gate
  +-- Security Gate
  |
Phase 2: Aggregate results, generate report
  |
Phase 3 (optional): Auto-fix (default 3 rounds, configurable up to 10)
```

> Source: Quality gate architecture (Section 7).

### 7.2 Three-Layer Zod Validation

The quality gate pipeline uses three-layer validation:

| Layer | Name | Validates | Timing |
|-------|------|-----------|--------|
| L1 | **Structural** | Schema shape conformance (Zod `.parse()`) | Phase 0 |
| L2 | **Semantic** | Cross-field rules within a single artifact (`.superRefine()`) | Per-gate |
| L3 | **Domain** | Cross-artifact consistency (references between schemas) | Consistency Gate |

**Boundary with Contract System (Section 8):** The contract system (Section 8) validates individual agent outputs against their schemas (L1 and L2). The quality gates (Section 7) validate aggregate project quality across all outputs (L3 and domain-specific rules). They do not overlap.

> Source: Quality gates (Section 7); contract system (Section 8); synthesis report G2 (boundary clarification).

### 7.3 Five Quality Gates

#### 7.3.1 Coverage Gate

Builds a bipartite graph mapping modules to tasks. Identifies:
- Modules with no covering tasks (uncovered)
- Contracts with no implementing tasks
- Auto-fix: generates skeleton task definitions for uncovered modules

**Score formula:** `score = coveredModules / totalModules`. A score of 1.0 means every module in the repo blueprint has at least one task covering it.

#### 7.3.2 Consistency Gate

Cross-reference integrity checking:
- All task dependencies reference existing tasks
- ADR decisions are reflected in task graph structure
- Naming conventions are consistent (fuzzy-match detection)
- Auto-fix: corrects naming inconsistencies, adds missing cross-references

**Score formula:** `score = 1.0 - (errorFindings / totalCrossReferences)`. Each cross-reference rule (XREF-001 through XREF-013) is checked; `errorFindings` counts severity `error` violations only. Warnings do not reduce the score.

#### 7.3.3 Testability Gate

Detects vague, untestable specifications using regex patterns:

```typescript
// Reference implementation
const VAGUE_PATTERNS = [
  /\bshould\s+(?:be\s+)?(?:fast|efficient|scalable|robust|reliable)\b/i,
  /\bif\s+(?:needed|necessary|appropriate|possible)\b/i,
  /\betc\.?\b/i,
  /\band\s+(?:so\s+on|more)\b/i,
  /\b(?:various|several|some|many)\s+\w+s?\b/i,
];
```

Auto-fix: converts vague statements to BDD-style `Given/When/Then` criteria.

**Score formula:** `score = 1.0 - (vagueStatements / totalStatements)`. Each task description, acceptance criterion, and test description is scanned. `totalStatements` is the count of all scannable text units across all tasks.

#### 7.3.4 Buildability Gate

- DFS 3-color cycle detection (same algorithm as DAG static layer validator)
- Kahn's topological sort validation
- File lock conflict analysis via BFS reachability
- Auto-fix: reorders tasks, adds missing dependencies

**Score formula:** Binary gate -- `score = 1.0` if no cycles detected AND topological sort succeeds AND no unresolvable file conflicts exist; `score = 0.0` otherwise. Partial scores are not meaningful for structural validity.

#### 7.3.5 Security Gate

Pattern-based detection:
- Secret patterns: AWS keys, JWT tokens, connection strings, API keys in plain text
- Shell injection patterns in task definitions
- Allowlist for known-safe patterns (e.g., placeholder values in templates)
- Auto-fix: replaces detected secrets with environment variable references

**Score formula:** `score = 1.0 - (weightedFindings / maxPossibleScore)` where severity weights are: `error = 1.0`, `warning = 0.3`, `info = 0.0`. Only `error` and `warning` findings reduce the score.

**Risk note:** The Security Gate has the highest false positive risk. Allowlisting and manual review are expected.

> Source: Quality gates (Section 7).

### 7.4 Auto-Fix Engine

The fix engine uses an ESLint-inspired declarative model:

```typescript
// Contract: implement exactly as specified
interface GateFix {
  readonly gateId: string;
  readonly ruleId: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly description: string;
  readonly location: {
    readonly file: string;
    readonly path: string[];         // JSON path within the file
  };
  readonly fix: {
    readonly type: 'replace' | 'insert' | 'delete';
    readonly target: string;
    readonly value: unknown;
  };
}
```

**Fix priority order:** security > buildability > consistency > coverage > testability.

Fixes are applied iteratively (default 3 rounds, configurable via `maxFixRounds`) with conflict checking between rounds. If a fix from a higher-priority gate conflicts with a lower-priority fix, the higher-priority fix wins.

> Source: Auto-fix engine design (Section 7.4).

### 7.5 Reporting

Four output formats:

| Format | Use Case | Library |
|--------|----------|---------|
| Console | Interactive development | chalk (colorized) |
| JSON | CI/CD pipelines | Built-in |
| Markdown | Documentation | Eta templates |
| JUnit | Test runner integration | XML generation |

```typescript
// Contract: implement exactly as specified
interface GateReport {
  readonly timestamp: Date;
  readonly duration: number;
  readonly gates: readonly GateResult[];  // See Section 7.6 for GateResult definition
  readonly overallScore: number;          // 0.0-1.0
  readonly passed: boolean;              // overallScore >= threshold
  readonly fixesApplied: number;
  readonly fixRoundsUsed: number;
}
```

> Source: Gate reporting design (Section 7.5).

### 7.6 Gate Plugin Interface

Each quality gate is implemented as a self-contained plugin conforming to the `GatePlugin` interface. This design mirrors ESLint's flat config plugin model: plugins are imported directly (no string-based discovery) and registered programmatically.

```typescript
// Contract: implement exactly as specified
/** A single quality gate plugin. */
interface GatePlugin {
  /** Unique gate identifier (e.g., 'coverage', 'security'). */
  readonly id: string;
  /** Human-readable gate name. */
  readonly name: string;
  /** SemVer version of this gate plugin. */
  readonly version: string;
  /** Gate priority for fix conflict resolution (lower = higher priority). */
  readonly priority: number;
  /** Whether this gate supports auto-fix. */
  readonly fixable: boolean;
  /** Execute the gate check against the provided context. */
  run(context: GateContext): Promise<GateResult>;
}

/** Context provided to each gate plugin at execution time. */
interface GateContext {
  /** The complete set of validated artifacts (from Section 10.8). */
  readonly artifacts: ArtifactSet;
  /** Gate-specific and global configuration. */
  readonly config: ResolvedGateConfig;
  /** Structured logger (pino instance). */
  readonly logger: Logger;
  /** Cross-reference validator for L3 validation queries (Section 10.8). */
  readonly validateCrossReferences: (artifacts: ArtifactSet) => CrossRefValidationResult;
  /** Abort signal for cancellation support. */
  readonly signal: AbortSignal;
  /** Resilience layer for LLM calls within gates (rate limiting, circuit breaking). */
  readonly resilience: ResilienceLayer;
  /** Provider adapter for LLM-powered auto-fix. Resolved by GateOrchestrator from ProviderRegistry. */
  readonly provider: ProviderAdapter;
  /** Model identifier for LLM-powered auto-fix (from gate config or global default). */
  readonly model: string;
  /** Shared semaphore limiting total concurrent LLM calls across all parallel gates. */
  readonly llmSemaphore: Semaphore;
}

/** Result returned by a gate plugin after execution. */
interface GateResult {
  readonly gateId: string;
  /** Score from 0.0 (complete failure) to 1.0 (perfect pass). */
  readonly score: number;
  /** Whether the gate passed its configured threshold. */
  readonly passed: boolean;
  /** Individual findings (violations, warnings, info). */
  readonly findings: readonly GateFinding[];
  /** Proposed fixes (only populated if gate is fixable). */
  readonly fixes: readonly GateFix[];
  /** Duration of this gate's execution in milliseconds. */
  readonly durationMs: number;
}

/** A single finding produced by a gate. */
interface GateFinding {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: {
    // See ArtifactType in Section 10.6. manifest excluded: gates do not validate the manifest itself.
    readonly artifact: 'task_graph' | 'repo_blueprint' | 'mpd' | 'tickets' | 'ai_prompt_pack';
    readonly file: string;
    readonly path: string[];  // JSON path within the artifact
  };
  /** Whether an auto-fix is available for this finding. */
  readonly fixable: boolean;
}
```

The `GatePlugin` interface intentionally does not include lifecycle hooks (setup/teardown). Gates are stateless: all state they need is provided via `GateContext`. This keeps the plugin contract simple and testable.

> Source: Gate plugin architecture (Section 7.6); ESLint flat config plugin model; Section 10.8 `ArtifactSet`.

#### 7.6.1 Resource Contention Mitigation

All 5 gates run in parallel (Phase 1), which creates three categories of resource contention:

**1. LLM API Rate Limits**

Gates that perform auto-fix (testability gate's BDD conversion, security gate's analysis) may issue LLM calls. All gate LLM calls MUST go through the `ResilienceLayer` (Section 9.4) via `GateContext.resilience`. A shared `Semaphore` (`GateContext.llmSemaphore`) limits total concurrent LLM calls across all parallel gates to prevent provider rate-limit exhaustion.

```typescript
// Reference implementation
// Inside a gate plugin's run() method:
async function autoFixWithLLM(context: GateContext, finding: GateFinding): Promise<GateFix> {
  return context.resilience.execute('gate-llm', async () => {
    await context.llmSemaphore.acquire();
    try {
      const start = performance.now();
      const response: GenerateResponse = await context.provider.generate({
        prompt: buildFixPrompt(finding),
        model: context.model,
        schema: GateFixSchema,
      });
      const latencyMs = performance.now() - start;
      const tokenUsage = extractTokenUsage(response);  // Section 2.3.1
      return { value: response.object as GateFixResult, tokenUsage, latencyMs };
    } finally {
      context.llmSemaphore.release();
    }
  }, context.signal);
}
```

**2. Memory Pressure**

Each gate receives a read-only reference to `ArtifactSet` (no deep copies). Gates that build intermediate data structures (e.g., buildability gate's DFS graph, coverage gate's bipartite graph) allocate memory independently. For large projects (>500 tasks), peak memory during Phase 1 may reach 2-3x the baseline artifact size. Mitigation: gates should use streaming/iterative algorithms where possible and release intermediate structures promptly.

**3. Abort Propagation**

All gates share a single `AbortSignal` via `GateContext.signal`. When any gate encounters a fatal error or the user cancels, the signal aborts all parallel gates. Each gate must check `signal.aborted` before starting expensive operations.

> Source: Design verification (gates-res agent, cross-examined by debate-conv and bm25 agents).

### 7.7 Gate Registration and Discovery

#### 7.7.1 Built-in Gate Registry

ATSF ships with 5 built-in gates. Registration uses a flat array pattern (inspired by ESLint flat config) where each entry is a direct import, not a string reference:

```typescript
// Reference implementation
// src/gates/registry.ts
import { coverageGate } from './coverage.js';
import { consistencyGate } from './consistency.js';
import { testabilityGate } from './testability.js';
import { buildabilityGate } from './buildability.js';
import { securityGate } from './security.js';
import type { GatePlugin } from './types.js';

/** Built-in gates in priority order (lower index = higher fix priority). */
const BUILTIN_GATES: readonly GatePlugin[] = [
  securityGate,       // priority 0 -- fixes win over all others
  buildabilityGate,   // priority 1
  consistencyGate,    // priority 2
  coverageGate,       // priority 3
  testabilityGate,    // priority 4
];

/** Gate registry combining built-in and custom gates. */
class GateRegistry {
  private readonly gates = new Map<string, GatePlugin>();

  constructor(builtins: readonly GatePlugin[] = BUILTIN_GATES) {
    for (const gate of builtins) {
      this.register(gate);
    }
  }

  /** Register a gate plugin. Throws if a gate with the same ID is already registered. */
  register(gate: GatePlugin): void {
    if (this.gates.has(gate.id)) {
      throw new Error(`Gate "${gate.id}" is already registered`);
    }
    this.gates.set(gate.id, gate);
  }

  /** Get all registered gates sorted by priority (ascending). */
  getAll(): GatePlugin[] {
    return [...this.gates.values()].sort((a, b) => a.priority - b.priority);
  }

  /** Get enabled gates based on configuration. */
  getEnabled(config: ResolvedGateConfig): GatePlugin[] {
    return this.getAll().filter(g => config.gates[g.id]?.enabled !== false);
  }

  /** Get a gate by ID. Returns undefined if not found. */
  get(id: string): GatePlugin | undefined {
    return this.gates.get(id);
  }
}
```

#### 7.7.2 Custom Gate Registration

Users can register custom gates via the configuration file. Custom gates are loaded from local files using dynamic import:

```typescript
// Illustrative — adapt to your implementation
// atsf.config.ts
import type { ATSFConfig } from 'atsf';
import myCustomGate from './gates/my-custom-gate.js';

export default {
  gates: {
    custom: [myCustomGate],
  },
} satisfies ATSFConfig;
```

Custom gates must conform to the `GatePlugin` interface. They are appended after built-in gates in priority order (custom gates have lower priority than built-in gates by default, unless they specify an explicit `priority` value).

#### 7.7.3 Gate Ordering and Dependency

Gates are logically independent and execute in parallel (Phase 1 of the pipeline in Section 7.1). There are no inter-gate dependencies at execution time. However, during the fix phase, priority ordering determines conflict resolution:

1. All 5+ gates run in parallel using `Promise.allSettled()`.
2. Results are aggregated and scored.
3. If auto-fix is enabled and the overall score is below threshold, fixes are collected from all gates.
4. Fixes are sorted by gate priority (ascending `priority` field).
5. Conflicting fixes (same `location.file` + `location.path`) are resolved by keeping the higher-priority (lower `priority` number) fix.
6. Surviving fixes are applied atomically, and the cycle repeats (max `maxFixRounds` iterations).

> Source: Gate plugin registration (Section 7.7); ESLint flat config plugin registration pattern.

### 7.8 Gate Configuration Schema

The gate configuration extends the existing `ATSFConfigSchema.gate` field (Section 3.4) with per-gate threshold and rule configuration. The Zod schema below defines the full gate configuration surface:

```typescript
// Contract: implement exactly as specified
import { z } from 'zod';

/** Per-gate configuration. */
const GateConfigEntry = z.object({
  /** Whether this gate is enabled. Default: true. */
  enabled: z.boolean().default(true),
  /** Per-gate pass threshold (0.0-1.0). Overrides global threshold. */
  threshold: z.number().min(0).max(1).optional(),
  /** Whether auto-fix is enabled for this gate. Overrides global autoFix. */
  autoFix: z.boolean().optional(),
  /** Custom rules for this gate (gate-specific). */
  rules: z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
    severity: z.enum(['error', 'warning', 'info']).optional(),
  })).optional(),
});

/** Complete gate configuration schema. */
const GateConfigSchema = z.object({
  /** Global pass threshold. All gates must meet this unless overridden. */
  threshold: z.number().min(0).max(1).default(0.8),
  /** Global auto-fix toggle. */
  autoFix: z.boolean().default(true),
  /** Maximum auto-fix rounds before giving up. */
  maxFixRounds: z.number().int().min(0).max(10).default(3),
  /** Reporter format for gate output. */
  reporter: z.enum(['console', 'json', 'markdown', 'junit']).default('console'),
  /** Per-gate overrides keyed by gate ID. */
  gates: z.record(z.string(), GateConfigEntry).default({}),
  /** Custom gate plugins (loaded via config file). */
  custom: z.array(z.any()).default([]),  // Runtime GatePlugin objects; validated by GateRegistry.register()
});

type GateConfig = z.infer<typeof GateConfigSchema>;

/** Resolved configuration with per-gate defaults merged. */
interface ResolvedGateConfig extends GateConfig {
  /** Resolved per-gate config with global defaults applied. */
  gates: Record<string, Required<z.infer<typeof GateConfigEntry>>>;
}
```

**Example `.atsfrc.yaml` configuration:**

```yaml
gate:
  threshold: 0.8
  autoFix: true
  maxFixRounds: 3
  reporter: console
  gates:
    coverage:
      enabled: true
      threshold: 0.7       # Coverage is harder to achieve; lower threshold
    consistency:
      enabled: true
      threshold: 0.9       # Cross-reference integrity is critical
    testability:
      enabled: true
      threshold: 0.75
    buildability:
      enabled: true
      threshold: 0.9       # DAG correctness is non-negotiable
    security:
      enabled: true
      threshold: 0.95      # Security findings are almost always real issues
      rules:
        secret-detection:
          enabled: true
          severity: error
        shell-injection:
          enabled: true
          severity: error
```

**Configuration resolution order:**
1. Built-in defaults (from Zod `.default()` values)
2. Config file values (`.atsfrc.yaml`, `atsf.config.ts`, etc.)
3. CLI flags (`--threshold`, `--no-autofix`, `--reporter json`)
4. Environment variables (`ATSF_GATE_THRESHOLD`, `ATSF_GATE_AUTOFIX`)

Per-gate thresholds override the global threshold. Per-gate `autoFix` overrides the global `autoFix`. If a gate has no per-gate config entry, the global values are used.

> Source: Gate configuration schema (Section 7.8); Section 3.4 (cosmiconfig + Zod); ESLint flat config rule severity pattern.

---

## 8. Contract System

### 8.1 Zod v4 Schemas

**CORRECTED from unspecified Zod version to Zod v4.x.**

All agents must use Zod v4.3.6+. The zod-v4-migration correction document verified that all of ATSF's core patterns work in v4, with specific syntax changes required.

```json
{
  "dependencies": {
    "zod": "^4.3.6"
  }
}
```

```typescript
// Contract: implement exactly as specified
import { z } from 'zod';  // After full migration to zod@4.x
```

> Source: zod-v4-migration correction, Sections 1--7.

### 8.2 Nine-Field Agent Output Schema

```typescript
// Contract: implement exactly as specified
import { z } from 'zod';

const AssumptionSchema = z.object({
  id: z.string().regex(/^ASMP-\d{3}$/),
  description: z.string().min(10),
  source: z.enum(['user', 'inferred', 'domain']),
  confidence: z.number().min(0).max(1),
  validatedBy: z.string().nullable(),
});

const FindingSchema = z.object({
  id: z.string().regex(/^FIND-\d{3}$/),
  description: z.string().min(10),
  evidence: z.array(z.string()).min(1),
  assumptionRefs: z.array(z.string().regex(/^ASMP-\d{3}$/)),
  severity: z.enum(['critical', 'major', 'minor', 'info']),
});

// NOTE: This is AgentDecisionSchema (agent output DEC-NNN records).
// The debate engine uses a separate DebateDecisionSchema (Section 6.8.3)
// for the judge's Decision output (Section 6.2). Do not confuse the two.
const DecisionSchema = z.object({
  id: z.string().regex(/^DEC-\d{3}$/),
  title: z.string().min(5),
  findingRef: z.string().regex(/^FIND-\d{3}$/),
  chosenOption: z.string(),
  rationale: z.string().min(20),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated']),
});

const RecommendationSchema = z.object({
  id: z.string().regex(/^REC-\d{3}$/),
  description: z.string().min(10),
  decisionRef: z.string().regex(/^DEC-\d{3}$/),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  effort: z.enum(['trivial', 'small', 'medium', 'large', 'epic']),
});

const RiskSchema = z.object({
  id: z.string().regex(/^RISK-\d{3}$/),
  description: z.string().min(10),
  probability: z.enum(['high', 'medium', 'low']),
  impact: z.enum(['critical', 'major', 'minor']),
  mitigation: z.string(),
});

const ConstraintSchema = z.object({
  id: z.string().regex(/^CNST-\d{3}$/),
  description: z.string().min(10),
  type: z.enum(['technical', 'business', 'regulatory', 'resource']),
  source: z.string(),
});

const DependencySchema = z.object({
  id: z.string().regex(/^DEP-\d{3}$/),
  name: z.string(),
  version: z.string(),
  purpose: z.string(),
  license: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
});

const InterfaceContractSchema = z.object({
  id: z.string().regex(/^INTF-\d{3}$/),
  name: z.string(),
  type: z.enum(['api', 'event', 'file', 'database']),
  schema: z.string(),  // Serialized Zod/JSON schema
  producer: z.string(),
  consumers: z.array(z.string()),
});

const MetadataSchema = z.object({
  agentId: z.string(),
  agentType: z.string(),
  timestamp: z.string().datetime(),
  model: z.string(),
  tokenUsage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  duration: z.number().nonnegative(),
});

/**
 * The complete 9-field agent output contract.
 * Every agent must produce output conforming to this schema.
 */
const AgentOutputSchema = z.object({
  assumptions: z.array(AssumptionSchema),
  findings: z.array(FindingSchema),
  decisions: z.array(DecisionSchema),
  recommendations: z.array(RecommendationSchema),
  risks: z.array(RiskSchema),
  constraints: z.array(ConstraintSchema),
  dependencies: z.array(DependencySchema),
  interfaces: z.array(InterfaceContractSchema),
  metadata: MetadataSchema,
});
```

> Source: Contract system (Section 8); 9-field agent output schema.

### 8.3 Cross-Field Validation via .superRefine()

**CORRECTED for Zod v4 compatibility.**

`.superRefine()` is fully supported in Zod v4 (the initial deprecation was reversed in August 2025, PR #4954). However, `ctx.path` is no longer available -- explicit `path` must be specified in each `ctx.addIssue()` call.

> **Zod v4 migration note:** In Zod v4, use the string literal `'custom'` directly for `code` in `ctx.addIssue()`. The v3 pattern `z.ZodIssueCode.custom` is no longer needed -- issue codes are plain strings in v4.

```typescript
// Reference implementation
const ValidatedAgentOutputSchema = AgentOutputSchema.superRefine((data, ctx) => {
  // Verify decision->finding referential integrity
  const findingIds = new Set(data.findings.map(f => f.id));
  for (const decision of data.decisions) {
    if (!findingIds.has(decision.findingRef)) {
      ctx.addIssue({
        code: 'custom',
        path: ['decisions'],   // REQUIRED in Zod v4 (ctx.path removed)
        message: `Decision ${decision.id} references non-existent finding ${decision.findingRef}`,
      });
    }
  }

  // Verify finding->assumption referential integrity
  const assumptionIds = new Set(data.assumptions.map(a => a.id));
  for (const finding of data.findings) {
    for (const ref of finding.assumptionRefs) {
      if (!assumptionIds.has(ref)) {
        ctx.addIssue({
          code: 'custom',
          path: ['findings'],
          message: `Finding ${finding.id} references non-existent assumption ${ref}`,
        });
      }
    }
  }

  // Verify recommendation->decision referential integrity
  const decisionIds = new Set(data.decisions.map(d => d.id));
  for (const rec of data.recommendations) {
    if (!decisionIds.has(rec.decisionRef)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recommendations'],
        message: `Recommendation ${rec.id} references non-existent decision ${rec.decisionRef}`,
      });
    }
  }
});
```

**Important Zod v4 behavior change:** If base object field validation fails, `.superRefine()` is NOT triggered. This is generally desirable for ATSF -- do not check referential integrity on structurally malformed data.

> Source: Contract system cross-field validation (Section 8.3); zod-v4-migration correction Sections 2.1, 3.

### 8.4 Three-Level Validation

| Level | Name | What It Validates | When |
|-------|------|-------------------|------|
| L1 | **Shape** | Schema conformance via `z.parse()` | Immediately after agent output |
| L2 | **Deep** | Cross-field rules via `.superRefine()` (as above) | After L1 passes |
| L3 | **Cross-Agent** | References between different agents' outputs (e.g., task graph references valid decisions) | During quality gate phase |

```typescript
// Reference implementation
async function validateAgentOutput(
  output: unknown,
  level: 1 | 2 | 3,
  crossAgentContext?: Map<string, unknown>
): Promise<ValidationResult> {
  // L1: Shape validation
  const l1Result = AgentOutputSchema.safeParse(output);
  if (!l1Result.success) {
    return { valid: false, level: 1, errors: l1Result.error.issues };
  }
  if (level === 1) return { valid: true, level: 1, errors: [] };

  // L2: Deep validation (cross-field within single output)
  const l2Result = ValidatedAgentOutputSchema.safeParse(output);
  if (!l2Result.success) {
    return { valid: false, level: 2, errors: l2Result.error.issues };
  }
  if (level === 2) return { valid: true, level: 2, errors: [] };

  // L3: Cross-agent validation (requires other agents' outputs)
  if (!crossAgentContext) {
    throw new Error('L3 validation requires crossAgentContext');
  }
  const l3Errors = validateCrossAgentReferences(l2Result.data, crossAgentContext);
  return { valid: l3Errors.length === 0, level: 3, errors: l3Errors };
}
```

> Source: Contract system 3-level validation (Section 8.4).

### 8.5 Versioned Envelope with Discriminated Union

**CORRECTED for Zod v4 syntax.**

In Zod v4, `z.discriminatedUnion()` takes a single argument (auto-detects the discriminator from literal fields). The old two-argument syntax may still work for backward compatibility, but the canonical v4 form is:

```typescript
// Contract: implement exactly as specified
const V1PayloadSchema = z.object({
  contractVersion: z.literal('1.0'),
  agentOutput: AgentOutputSchema,
  checksum: z.string(),
});

const V2PayloadSchema = z.object({
  contractVersion: z.literal('2.0'),
  agentOutput: AgentOutputSchema,
  checksum: z.string(),
  migrationLog: z.array(z.string()),  // Added in v2
});

// Zod v4 syntax: single argument, auto-detects discriminator
const VersionedEnvelope = z.discriminatedUnion([
  V1PayloadSchema,
  V2PayloadSchema,
]);

// Apply cross-version validation to the UNION, not individual members
// (superRefine on members breaks discriminator detection)
const ValidatedEnvelope = VersionedEnvelope.superRefine((data, ctx) => {
  // Cross-version validation logic
});
```

**Important Zod v4 limitation:** You cannot apply `.superRefine()` to individual discriminated union members and then compose them into a `z.discriminatedUnion()`. The refinement wraps the schema in `ZodEffects`, which breaks discriminator detection. Apply refinements to the union itself.

> Source: Contract system versioned envelope (Section 8.5); zod-v4-migration correction Section 2.2.

### 8.6 Additional Zod v4 Migration Notes

These syntax changes affect ATSF's contract schemas:

| Change | Zod v3 | Zod v4 |
|--------|--------|--------|
| Error messages | `{ message: "..." }` | `{ error: "..." }` |
| `z.record()` | `z.record(z.string())` | `z.record(z.string(), z.string())` (two args required) |
| `.merge()` | `schemaA.merge(schemaB)` | `schemaA.extend(schemaB.shape)` or `schemaA.extend(schemaB)` |
| ZodError access | `error.errors` | `error.issues` only (`error.errors` removed) |
| Issue codes | 15 codes | 11 codes (some merged/renamed) |
| Constructor params | `invalid_type_error`, `required_error` | `error` (function or string) |

**Automated migration:** Run `npx zod-v3-to-v4@latest` to handle most mechanical changes.

> **Ecosystem compatibility note:** If using `zod-validation-error` for user-friendly error messages, version 5.0.0+ is required for Zod v4 compatibility. Alternatively, Zod v4 provides a built-in `z.prettifyError()` function that may be sufficient for ATSF's needs without the additional dependency.

> Source: zod-v4-migration correction Sections 3--5.

### 8.7 Contract Lock Manager

In-memory contract lock manager with TTL for preventing concurrent modifications:

```typescript
// Contract: implement exactly as specified
interface ContractLockManager {
  /**
   * Acquire a lock on a contract by ID.
   * Returns true if acquired, false if already locked by another holder.
   */
  acquire(contractId: string, holderId: string, ttlMs?: number): boolean;

  /** Release a lock. Only the holder can release. */
  release(contractId: string, holderId: string): boolean;

  /** Check if a contract is locked. */
  isLocked(contractId: string): boolean;

  /** Get the holder of a lock. */
  getHolder(contractId: string): string | null;

  /** Force-release expired locks (called periodically). */
  cleanup(): number;
}
```

> **Note:** ContractLockManager is specified for future multi-version contract migration scenarios. The MVP uses a single contract version and does not require concurrent lock management. Implementors MAY defer this to post-MVP.

> Source: Contract lock manager design (Section 8.9).

---

## 9. Parallel Execution

### 9.1 Threading Model

ATSF uses a **single event loop + async** model (not worker threads). This is the correct choice because ATSF's workload is I/O-bound (LLM API calls), not CPU-bound. `async/await` with `Promise.all()` provides sufficient concurrency without the complexity of inter-thread communication.

**Cancellation:** The `OrchestratorEngine` receives an optional `AbortSignal` via `OrchestratorConfig.signal` and passes it to the `DAGScheduler`. The scheduler checks the signal before dispatching each new task and aborts in-flight tasks by passing the signal to `ResilienceLayer.execute()`. When aborted, the scheduler emits an `execution.cancelled` event.

> Source: Parallel execution design (Section 9).

#### 9.1.1 DAGScheduler Interface

The `DAGScheduler` is the runtime entry point for executing a validated `TaskGraph`. It consumes the static layer's output, dispatches tasks layer-by-layer via `TaskExecutor`, respects file lock constraints, and reports progress through the `EventBus`.

```typescript
// Contract: implement exactly as specified
/**
 * Runtime DAG scheduler.
 * Consumes a validated TaskGraph and executes tasks respecting
 * dependency ordering, file lock constraints, and concurrency limits.
 *
 * Constructor dependencies: EventBus, ResilienceLayer, FileLockManager, p-queue config.
 *
 * Source: Parallel execution (Section 9); dag-events-resilience correction Section 1.
 */
interface DAGSchedulerConfig {
  readonly concurrency: number;      // max parallel tasks (default: 5, from ATSFConfig.build.maxConcurrency)
  readonly taskTimeoutMs: number;    // per-task timeout (default: 300_000)
  readonly throwOnTimeout: boolean;  // whether p-queue throws on timeout (default: true)
}

interface DAGScheduler {
  /**
   * Constructor dependencies (via dependency injection):
   *   eventBus: EventBus
   *   resilience: ResilienceLayer
   *   fileLockManager: FileLockManager
   *   executor: TaskExecutor
   *   config: DAGSchedulerConfig
   */

  /**
   * Execute all tasks in the graph, returning a final execution snapshot.
   * Tasks are dispatched layer-by-layer; within each layer, tasks run
   * concurrently subject to file lock and concurrency constraints.
   * Pass an AbortSignal to support cancellation from OrchestratorEngine.
   */
  execute(graph: TaskGraph, signal?: AbortSignal): Promise<ExecutionSnapshot>;

  /** Pause task dispatch (in-flight tasks continue to completion). */
  pause(): void;

  /** Resume task dispatch after a pause. */
  resume(): void;

  /** The event bus used for execution lifecycle events. */
  readonly eventBus: EventBus;
}
```

#### 9.1.2 TaskExecutor Interface

The `TaskExecutor` dispatches a single `TaskNode` to a provider, wrapping the call in the resilience pipeline and managing file locks for the duration of execution.

**TaskNode → FileAccess[] conversion:** The executor converts `TaskNode.filesWrite` and `TaskNode.filesRead` to `FileAccess[]` before calling `FileLockManager.acquire()`:

```typescript
// Illustrative — adapt to your implementation
function toFileAccess(node: TaskNode): FileAccess[] {
  return [
    ...node.filesWrite.map(p => ({ pattern: p, mode: 'write' as const })),
    ...node.filesRead.map(p => ({ pattern: p, mode: 'read' as const })),
  ];
}
```

**Provider resolution:** The executor resolves `TaskNode.agent` → `AgentDefinition` → `ProviderAdapter` via `ProviderRegistry.get(agentDef.provider)`. The `ProviderRegistry` is passed through `ExecutionContext` (see below).

```typescript
// Contract: implement exactly as specified
/**
 * Dispatches a single task to its assigned provider.
 * Acquires file locks, invokes the provider through the resilience layer,
 * and releases locks on completion or failure.
 *
 * Source: Parallel execution (Section 9); dag-events-resilience correction Section 1.
 */
interface TaskExecutor {
  dispatch(node: TaskNode, context: ExecutionContext): Promise<TaskResult>;
}

/**
 * Runtime context passed to the TaskExecutor for each task dispatch.
 * Provides access to the provider, resilience layer, file locks, and event bus.
 */
interface ExecutionContext {
  readonly providerRegistry: ProviderRegistry;  // for per-task provider resolution via TaskNode.agent
  readonly resilience: ResilienceLayer;
  readonly lockManager: FileLockManager;
  readonly eventBus: EventBus;
  readonly agentDefinitions: ReadonlyMap<string, AgentDefinition>;  // agent type -> definition
  readonly signal?: AbortSignal;
}

/**
 * The result of a single task execution.
 */
interface TaskResult {
  readonly taskId: TaskId;
  readonly output: unknown;
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
}
```

### 9.2 Priority Queue: p-queue

ATSF uses `p-queue` v9.1.0 (ESM-only) for priority-based task scheduling with timeout, pause/resume support, and event emission.

**Note:** The original specification referenced "v8+". The current version is v9.1.0. The API is backward-compatible with v8 concepts. The ESM-only nature is compatible with ATSF's `"type": "module"` configuration.

```typescript
// Reference implementation
import PQueue from 'p-queue';

const queue = new PQueue({
  concurrency: 5,       // Initial; adaptive controller adjusts this
  timeout: 300_000,     // 5 minutes per task
  throwOnTimeout: true,
});

queue.on('active', () => {
  console.log(`Working on task. Queue size: ${queue.size}  Pending: ${queue.pending}`);
});
```

> Source: Parallel execution (Section 9.2); synthesis report V3 (version verified as v9.1.0).

### 9.3 In-Memory FileLockManager

The `FileLockManager` enforces mutual exclusion at runtime using the pre-computed `FileConflict[]` data from the static layer. It uses atomic bulk acquisition to prevent deadlocks.

```typescript
// Contract: implement exactly as specified
type FileAccessMode = 'read' | 'write';

interface FileAccess {
  readonly pattern: string;       // glob pattern or resolved path
  readonly mode: FileAccessMode;
}

/**
 * In-memory file lock manager (~150 LOC).
 * Uses bulk acquire (all-or-wait) to prevent deadlocks.
 * FIFO fairness queue prevents starvation.
 * TTL-based expiration handles crash recovery.
 *
 * Source: In-memory file lock manager (Section 9.3); dag-events-resilience correction Section 1.7;
 * Design verification (lockman agent).
 */
interface FileLockManager {
  /**
   * Attempt to acquire all locks for a task atomically.
   * Returns a Promise that resolves to true when all locks are acquired.
   * If locks are unavailable, the task is enqueued in the FIFO queue and
   * the Promise resolves when the task reaches the front and all its
   * locks become available.
   * All-or-nothing: never partially acquires.
   * Tasks are served in FIFO order to prevent starvation.
   */
  acquire(taskId: TaskId, files: readonly FileAccess[]): Promise<boolean>;

  /** Release all locks held by a task and remove from FIFO queue. */
  release(taskId: TaskId): void;

  /** Check if a task's files are available (without acquiring). */
  canAcquire(taskId: TaskId, files: readonly FileAccess[]): boolean;

  /**
   * Force-release locks held longer than TTL.
   * Called periodically by the DAGScheduler (default interval: 30s).
   * Returns array of task IDs whose locks were force-released.
   */
  expireStale(ttlMs: number): TaskId[];

  /** Get the current FIFO queue depth (tasks waiting for locks). */
  readonly queueDepth: number;
}

interface FileLockManagerConfig {
  /** Maximum time a lock can be held before forced expiration (default: 300_000ms = 5min). */
  readonly lockTtlMs: number;
  /** Interval for stale lock reaping (default: 30_000ms). */
  readonly reapIntervalMs: number;
}
```

**Deadlock prevention strategy:** Structural all-or-wait bulk acquire. A task either acquires ALL its file locks atomically or waits. Since no task holds partial locks, circular wait is impossible.

**Formal proof sketch (Coffman conditions):**
1. **Mutual exclusion:** Satisfied by design (write locks are exclusive).
2. **Hold and wait:** *Eliminated.* Bulk acquire is all-or-nothing; a task never holds a subset of its required locks.
3. **No preemption:** Locks can be preempted via TTL expiration for crash recovery.
4. **Circular wait:** *Impossible.* Since no task holds partial locks, no circular dependency chain can form.

With condition 2 eliminated, deadlock is structurally impossible regardless of lock ordering.

**Starvation prevention (FIFO fairness queue):**

Without fairness ordering, a task requiring many contested locks could be perpetually preempted by smaller tasks that acquire their locks faster. The FIFO queue ensures:

1. When `acquire()` fails, the task is appended to a queue.
2. On each `release()`, the queue is scanned front-to-back.
3. The first queued task whose locks are now available is granted.
4. This guarantees bounded waiting: a task waits at most until all tasks ahead of it in the queue complete.

```
FIFO Queue Behavior:
  acquire(T3, [a.ts, b.ts]) -> fails (a.ts held by T1)
  acquire(T4, [c.ts])       -> succeeds (c.ts free)
  acquire(T5, [a.ts])       -> fails (a.ts held by T1), queued after T3
  release(T1)               -> T3 checked first (FIFO), T3 gets a.ts+b.ts
                             -> T5 must wait for T3 even though a.ts is briefly free
```

**TTL-based crash recovery:**

If a task crashes or hangs without calling `release()`, its locks would be held indefinitely. The `expireStale()` method, called periodically by the DAGScheduler, force-releases locks held longer than `lockTtlMs` (default: 5 minutes). The corresponding task is marked as `failed` in the execution state, and its dependents are re-evaluated.

> **Scaling note:** In the MVP (maxConcurrency=5), lock-waiting tasks consuming concurrency slots has negligible impact. For large projects (>100 tasks with high file conflict density), implementors should consider a "lock-or-yield" pattern where tasks that cannot acquire locks are re-enqueued rather than blocking a concurrency slot.

> Source: File lock deadlock prevention (Section 9.3); dag-events-resilience correction Section 1.7; Design verification (lockman agent).

**p-queue vs FileLockManager FIFO -- two distinct scheduling layers:**

`p-queue` (Section 9.2) and the FileLockManager FIFO queue operate at different levels of the scheduling stack and should not be conflated:

- **p-queue** controls *task dequeuing order*. It decides WHEN a task is popped from the ready queue based on priority and concurrency limits. A high-priority task is dequeued before a low-priority one.
- **FileLockManager FIFO** controls *lock acquisition order*. It decides WHO gets the file lock when multiple tasks contend for the same files. Tasks waiting for locks are served first-come-first-served regardless of priority.

A high-priority task dequeued by p-queue may still wait in the FIFO lock queue if the files it needs are held by another task. Conversely, a low-priority task already in the FIFO queue will be served before a newly-arrived high-priority task for the same locks. This separation ensures that priority affects scheduling throughput while FIFO ensures lock fairness and starvation prevention.

### 9.4 Unified Resilience Layer

**CORRECTED from the original separate rate-limiting and circuit-breaker implementations.**

The dag-events-resilience correction merges the rate limiting and cost tracking implementation with the circuit breakers and adaptive concurrency implementation into a single module.

```
src/resilience/
  rate-limiter.ts             # TokenBucketRateLimiter
  semaphore.ts                # Counting semaphore
  circuit-breaker.ts          # Per-provider circuit breaker
  adaptive-concurrency.ts     # AdaptiveConcurrencyController
  cost-tracker.ts             # Budget enforcement
  resilience-layer.ts         # Facade composing all of the above
```

#### 9.4.1 ResilienceLayer Interface

```typescript
// Contract: implement exactly as specified
/**
 * The result of a resilience-wrapped provider call.
 * The `execute()` method unwraps this, returning only `T` to the caller.
 */
interface ResilienceResult<T> {
  readonly value: T;
  readonly tokenUsage: TokenUsage;
  readonly latencyMs: number;
}

interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

interface ExecutionSnapshot {
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly pendingTasks: number;
  readonly runningTasks: number;
  readonly skippedTasks: number;
  readonly totalCostUsd: number;
  readonly elapsedMs: number;
}

interface ResilienceLayer {
  /**
   * Execute a provider call through the full resilience pipeline:
   * cost check -> circuit breaker -> rate limiter -> semaphore -> fn()
   */
  execute<T>(
    provider: string,
    fn: () => Promise<ResilienceResult<T>>,
    signal?: AbortSignal
  ): Promise<T>;

  /** Get circuit state for a provider. */
  getCircuitState(provider: string): 'closed' | 'open' | 'half-open';

  /** Get current concurrency limit for a provider. */
  getConcurrencyLimit(provider: string): number;

  /** Access cost tracker for budget inspection. */
  readonly costTracker: CostTracker;

  /** Register a provider with its resilience config. */
  registerProvider(provider: string, config: ProviderResilienceConfig): void;

  /** Shut down adaptive controllers and clean up timers. */
  shutdown(): void;
}
```

#### 9.4.2 Circuit Breaker

Per-provider, with configurable thresholds:

```typescript
// Contract: implement exactly as specified
interface CircuitBreakerConfig {
  readonly failureThreshold: number;    // default: 5
  readonly cooldownMs: number;          // default: 30000
  readonly halfOpenMaxAttempts: number;  // default: 1
}
```

State transitions: `closed` -> (5 failures) -> `open` -> (30s cooldown) -> `half-open` -> (1 test success) -> `closed`.

#### 9.4.3 Semaphore

```typescript
// Contract: implement exactly as specified
/**
 * Counting semaphore for concurrency control.
 * Used by AdaptiveConcurrencyController to limit concurrent provider calls,
 * and by GateContext.llmSemaphore to limit concurrent LLM calls across gates.
 * Located in src/resilience/semaphore.ts.
 */
interface Semaphore {
  /** Acquire a permit. Resolves when a permit is available. */
  acquire(): Promise<void>;

  /** Release a permit, waking the next waiter in FIFO order. */
  release(): void;

  /** Current number of available permits. */
  readonly available: number;

  /**
   * Dynamically adjust the maximum number of permits (used by AdaptiveConcurrencyController).
   * - Increasing: if new max > old max, resolve queued waiters in FIFO order up to
   *   the number of newly available permits.
   * - Decreasing: does NOT revoke already-held permits. Excess permits drain naturally
   *   as holders call release(). New acquires block until available < new max.
   * - Throws if max < 1.
   */
  setMaxPermits(max: number): void;
}
```

#### 9.4.4 AdaptiveConcurrencyController

```typescript
// Contract: implement exactly as specified
interface AdaptiveConcurrencyConfig {
  readonly initialConcurrency: number;   // default: 5
  readonly minConcurrency: number;       // default: 1
  readonly maxConcurrency: number;       // default: 20
  readonly latencyTargetMs: number;      // default: 5000
  readonly adjustmentInterval: number;   // default: 10000
  readonly increaseRatio: number;        // default: 1.1
  readonly decreaseRatio: number;        // default: 0.7
}
```

The adaptive controller adjusts the `Semaphore`'s max permits over time based on observed latency and error rates. When latency is below target, concurrency increases by `increaseRatio`. When latency exceeds target or errors occur, concurrency decreases by `decreaseRatio`.

#### 9.4.5 Cost Tracking

```typescript
// Contract: implement exactly as specified
interface CostBudget {
  readonly perRunUsd?: number;
  readonly perDayUsd?: number;
  readonly perMonthUsd?: number;
}

interface CostRecord {
  readonly provider: string;         // e.g., 'openrouter', 'claude-code'
  readonly model: string;            // e.g., 'anthropic/claude-sonnet-4'
  readonly promptTokens: number;     // matches TokenUsage.promptTokens (Section 9.4.1)
  readonly completionTokens: number; // matches TokenUsage.completionTokens (Section 9.4.1)
  readonly totalTokens: number;      // matches TokenUsage.totalTokens
  readonly costUsd: number;          // pre-computed cost for this call
  readonly timestamp: Date;
  readonly taskId?: TaskId;          // which task triggered this call (if applicable)
  readonly phase?: 'plan' | 'debate' | 'build' | 'gate' | 'emit' | 'query';
}

interface CostTracker {
  check(): void;              // throws BudgetExceededError if over budget
  record(cost: CostRecord): void;
  readonly currentRunCostUsd: number;
  readonly todayCostUsd: number;
  readonly monthCostUsd: number;
}
```

**BudgetExceededError propagation policy:**

When `CostTracker.check()` throws `BudgetExceededError` inside the resilience pipeline:
1. The error propagates out of `ResilienceLayer.execute()` to the caller (TaskExecutor, DebateEngine, or GatePlugin).
2. `DAGScheduler` treats `BudgetExceededError` as a **fatal non-retryable error** (unlike transient provider errors which trigger circuit breaker/retry logic).
3. The scheduler fires the `AbortController` signal to cancel in-flight tasks, then emits `execution.cancelled` with `reason: 'budget_exceeded'`.
4. The `OrchestratorEngine` catches the error at the `DAGScheduler.execute()` boundary and sets `OrchestratorResult.success = false`.
5. `BudgetExceededError` does **NOT** affect circuit breaker state (it is not a provider failure).

> **Clarification:** Cost recording via `CostTracker.record()` is called synchronously within `ResilienceLayer.execute()` on the success path. The `task.completed` event carries `tokenUsage` for informational purposes (UI, telemetry) but is NOT the primary cost recording mechanism. Loss of events does not affect budget enforcement.

> Source: Resilience layer (Section 9.4); dag-events-resilience correction Section 3.

---

## 10. Emitter & Artifacts

### 10.1 Eta v4 Template Engine

**CORRECTED from the original Eta v3.x reference.**

ATSF uses **Eta v4.5.1** for template rendering. The eta-madr-update correction document verified that the v4 release was primarily a build system modernization, not an API overhaul. The core class-based API from v3 is fully preserved in v4.

```typescript
// Reference implementation
import { Eta } from 'eta';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: path.join(__dirname, 'templates'),
  autoEscape: false,    // Required for Markdown output (CONFIRMED working in v4)
  cache: true,          // Cache compiled templates in production
  debug: false,
  varName: 'it',
  defaultExtension: '.eta',
});

// Synchronous rendering (for Markdown generation)
const markdown = eta.render('./mpd-template', { project, tasks, decisions });

// Async rendering (if templates use async data sources)
const asyncMarkdown = await eta.renderAsync('./ticket-template', { task, context });

// String rendering (no file system, useful for tests)
const quick = eta.renderString('# <%= it.title %>', { title: 'Test' });
```

**What is new in v4 vs v3:**
- Dual CJS/ESM support restored (v4.3.0+)
- New `outputFunctionName` config option (v4.1.0, default: `"output"`)
- `error.cause` added to RuntimeErr (v4.3.0)
- Build tooling changed to tsdown/Biome/Vitest (no user-facing impact)

**What is unchanged:** All template syntax (`<%= %>`, `<%~ %>`, `<% %>`), `autoEscape`, `renderAsync`, `renderString`, `renderStringAsync`, `loadTemplate`, `configure`, `withConfig`, constructor API, tags config, views, cache, varName.

> Source: Template engine (Section 10.1); eta-madr-update correction Part 1.

### 10.2 YAML Generation: yaml (eemeli/yaml) v2.x

ATSF uses `yaml` (eemeli/yaml) v2.8.2 for all YAML generation, standardized across all modules (resolving synthesis report contradiction C5).

```typescript
// Reference implementation
import { stringify } from 'yaml';

const yamlOutput = stringify(taskGraph, {
  sortMapEntries: true,          // Deterministic key ordering
  lineWidth: 120,
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
});
```

**Why `yaml` over `js-yaml`:**
- YAML 1.2 support (js-yaml only supports 1.1)
- Native `sortMapEntries` for deterministic output
- Native TypeScript types (no `@types/*` needed)
- Zero dependencies
- 85M+ weekly downloads

> Source: YAML generation (Section 10.2); synthesis report V4 (version verified).

### 10.3 Emitter Pipeline

The emitter runs sequentially through 6 stages, each writing to a VirtualFS (in-memory). After all emitters complete, VirtualFS atomically flushes to disk.

```
task_graph emitter
  -> repo_blueprint emitter
    -> MPD emitter
      -> tickets emitter
        -> ai_prompt_pack emitter
          -> manifest emitter
            -> VirtualFS.flush() (atomic write to disk)
```

The sequential order matters: later emitters may reference earlier outputs (e.g., tickets reference task graph IDs, MPD references repo blueprint).

### 10.4 VirtualFS for Atomic Flush

```typescript
// Contract: implement exactly as specified
interface VirtualFS {
  /** Write a file to the in-memory filesystem. */
  writeFile(path: string, content: string | Buffer): void;

  /** Read a file from the in-memory filesystem. */
  readFile(path: string): string | Buffer | undefined;

  /** List all files in the virtual filesystem. */
  listFiles(): readonly string[];

  /**
   * Atomically flush all files to disk.
   * Creates a sibling temp directory (`{outputDir}/.atsf-tmp-{uuid}/`) in the
   * SAME parent directory as outputDir to avoid cross-device rename failures.
   * Writes all files to the temp directory, then calls fs.rename() to swap it
   * into place. If rename fails with EXDEV (cross-device), falls back to
   * recursive copy + delete.
   * Ensures all-or-nothing: no partial output on failure.
   */
  flush(outputDir: string): Promise<void>;

  /** Clear all files (for testing/reset). */
  clear(): void;
}
```

### 10.5 Deterministic Output

ATSF guarantees deterministic output for the same input:

| Technique | Purpose |
|-----------|---------|
| `sortMapEntries: true` | YAML keys are always in alphabetical order |
| Canonical array sorting | Arrays sorted by stable key (e.g., task ID) |
| Fixed timestamps | Timestamps are deterministic per-run (not per-file) |
| Content hashing (SHA-256) | Manifest includes hash of each file for integrity verification |

```typescript
// Reference implementation
import { createHash } from 'node:crypto';

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
```

### 10.6 Six Artifact Types

The ATSF pipeline produces six artifact types: `task_graph.yaml`, `repo_blueprint.yaml`, `MPD.md`, `tickets/`, `ai_prompt_pack/`, and `manifest.json`.

**Canonical `ArtifactType` constant** (defined once; referenced everywhere else):

```typescript
// Contract: implement exactly as specified
// src/contracts/artifact-schemas.ts
// The authoritative list of all six ATSF artifact types.
// All other code that needs this list MUST import from this constant.
const ARTIFACT_TYPES = [
  'task_graph',
  'repo_blueprint',
  'mpd',
  'tickets',
  'ai_prompt_pack',
  'manifest',
] as const;

type ArtifactType = typeof ARTIFACT_TYPES[number];
// ArtifactType = 'task_graph' | 'repo_blueprint' | 'mpd' | 'tickets' | 'ai_prompt_pack' | 'manifest'

export { ARTIFACT_TYPES, ArtifactType };
```

#### 10.6.1 task_graph.yaml

The validated task graph in YAML format. Contains all tasks, dependencies, file access declarations, priorities, and metadata.

```yaml
version: "1.0"
generated: "2026-02-25T12:00:00Z"
checksum: "sha256:abc123..."
project:
  name: "SaaS CRM MVP"
tasks:
  - id: TASK-001
    name: "Define database schema"
    agent: planner
    dependsOn: []
    filesWrite: ["docs/database-schema.yaml"]
    filesRead: ["requirements.md"]
    priority: 5
```

#### 10.6.2 repo_blueprint.yaml

Directory structure and file listing for the target repository:

```yaml
version: "1.0"
root:
  - name: src/
    children:
      - name: api/
        files:
          - name: routes.ts
            purpose: "API route definitions"
            generatedBy: TASK-003
      - name: models/
        files:
          - name: user.ts
            purpose: "User model and validation"
            generatedBy: TASK-002
```

#### 10.6.3 MPD.md (Master Planning Document)

A comprehensive 13-section Markdown document with:
- Table of contents
- Mermaid diagrams (architecture, dependency graphs)
- Cross-references to tasks, decisions, and tickets
- Executive summary, technical architecture, risk assessment

#### 10.6.4 tickets/

Individual developer tickets as YAML frontmatter + Markdown:

```markdown
---
id: TASK-003
title: "Implement API route definitions"
type: feature
priority: high
estimate: 4h
dependencies: [TASK-001, TASK-002]
labels: [api, backend]
---

## Description

Implement the REST API routes for the CRM application.

## Acceptance Criteria

- Given a valid user session
- When a GET request is made to /api/users
- Then the response contains a paginated list of users with status 200
```

Compatible with Jira, Linear, and GitHub Issues import formats.

#### 10.6.5 ai_prompt_pack/

Self-contained, per-task prompts for downstream code generation tools:

```markdown
# Task: TASK-003 - Implement API route definitions

## Context
You are implementing the REST API routes for a SaaS CRM application.

## Contract
Your output MUST conform to this schema:
- File: `src/api/routes.ts`
- Exports: `createRouter(): Router`
- Dependencies: express@4.x, zod@4.x

## Input Files (Read-Only)
- `docs/database-schema.yaml` (from TASK-001)
- `docs/api-spec.yaml` (from TASK-002)

## Instructions
1. Create Express router with typed route handlers
2. Validate request bodies using Zod schemas
3. Return proper HTTP status codes

## DO NOT
- Do not use any ORM (raw SQL with parameterized queries)
- Do not add authentication middleware (handled by TASK-005)
- Do not modify files outside `src/api/`
```

Each prompt includes inlined contracts, negative instructions, and task-type-specific templates.

#### 10.6.6 manifest.json

The output manifest records every file produced by the pipeline, including checksums and artifact type classifications. It serves as the single entry point for downstream tooling to discover and validate ATSF output.

```json
{
  "atsfVersion": "1.0.0",
  "projectName": "SaaS CRM MVP",
  "generatedAt": "2026-02-25T12:00:00Z",
  "files": [
    {
      "path": "task_graph.yaml",
      "checksum": "sha256:abc123...",
      "sizeBytes": 4096,
      "artifactType": "task_graph"
    }
  ],
  "totalTasks": 12,
  "totalCostUsd": 0.42,
  "durationMs": 15000
}
```

> Source: Six artifact types and emitter pipeline (Section 10.6).

### 10.7 Output Contract (Zod Schemas)

All 6 artifact types (including the output manifest) have formal Zod v4 schemas that define their structure. These schemas serve as the machine-enforceable output contract: every emitter must produce data that passes `schema.parse()` before writing to disk. The complete schemas are defined in `src/contracts/artifact-schemas.ts`.

#### 10.7.1 Shared Primitives

```typescript
// Contract: implement exactly as specified
import { z } from 'zod';

/** Task ID format: TASK-NNN (zero-padded, 3+ digits) */
const TaskId = z.string().regex(/^TASK-\d{3,}$/, {
  error: 'Task ID must match pattern TASK-NNN (e.g., TASK-001)',
});

/** Artifact format version (MAJOR.MINOR). Used for task_graph, repo_blueprint, mpd schemas. */
const ArtifactVersion = z.string().regex(/^\d+\.\d+$/, {
  error: 'Artifact version must be in format N.N (e.g., 1.0)',
});

/** Full semantic version string (MAJOR.MINOR.PATCH). Used for atsfVersion in manifest. */
const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/, {
  error: 'Version must be in SemVer format N.N.N (e.g., 1.0.0)',
});

/** ISO 8601 datetime string */
const ISODatetime = z.string().datetime();

/** SHA-256 checksum with prefix */
const Checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/, {
  error: 'Checksum must be sha256:<64 hex chars>',
});

/** Agent type enum -- the 8 MVP agent roles */
const AgentType = z.enum([
  'planner', 'architect', 'critic', 'judge',
  'builder', 'reviewer', 'documenter', 'integrator',
]);

/** Task type enum */
const TaskType = z.enum([
  'feature', 'architecture', 'testing', 'documentation',
  'review', 'infrastructure', 'security', 'refactoring',
]);

/** Priority levels (1 = lowest, 5 = highest) */
const Priority = z.number().int().min(1).max(5);

/** Ticket priority as enum string */
const TicketPriority = z.enum(['critical', 'high', 'medium', 'low']);

/** Ticket type enum */
const TicketType = z.enum([
  'feature', 'bug', 'task', 'spike', 'chore',
  'architecture', 'testing', 'documentation',
]);

/** Ticket status enum */
const TicketStatus = z.enum([
  'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled',
]);

/** Complexity estimate for AI prompt packs */
const Complexity = z.enum(['trivial', 'low', 'medium', 'high', 'very_high']);

/** Suggested model tier for AI prompt packs */
const SuggestedModel = z.enum(['fast', 'balanced', 'powerful']);

/** File path (relative to project root, no leading slash) */
const RelativeFilePath = z.string().min(1).regex(/^[^/]/, {
  error: 'File path must be relative (no leading slash)',
});

/** ADR reference pattern: ADR-NNN */
const AdrRef = z.string().regex(/^ADR-\d{3,}$/, {
  error: 'ADR reference must match pattern ADR-NNN',
});
```

#### 10.7.2 TaskGraphSchema

The task graph schema validates the complete `task_graph.yaml` artifact, including DAG cycle detection via DFS 3-color marking in `.superRefine()`.

```typescript
// Contract: implement exactly as specified
const AcceptanceCriterion = z.object({
  description: z.string().min(10),
  testable: z.boolean().default(true),
});

/**
 * TaskNodeArtifact: the serialized task definition in task_graph.yaml.
 * Distinct from `TaskNode` in Section 5.2 (the in-memory DAG node interface)
 * and from `RawTaskDefinition` (the builder input). This schema is richer,
 * including description, type, acceptanceCriteria, and tags for artifact output.
 */
const TaskNodeArtifact = z.object({
  id: TaskId,
  name: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  agent: AgentType,
  type: TaskType,
  dependsOn: z.array(TaskId).default([]),
  filesWrite: z.array(RelativeFilePath).min(1),
  filesRead: z.array(RelativeFilePath).default([]),
  priority: Priority,
  estimatedTokens: z.number().int().min(100).max(500000).optional(),
  category: z.string().min(1).max(60).optional(),
  acceptanceCriteria: z.array(AcceptanceCriterion).min(1),
  tags: z.array(z.string().min(1).max(30)).default([]),
});

const ProjectMeta = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  techStack: z.array(z.object({
    name: z.string().min(1),
    version: z.string().optional(),
    purpose: z.string().min(1),
  })).min(1).optional(),
  constraints: z.array(z.string().min(5)).default([]),
});

const TaskGraphSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  project: ProjectMeta,
  tasks: z.array(TaskNodeArtifact).min(1),
}).superRefine((data, ctx) => {
  const taskIds = new Set(data.tasks.map(t => t.id));

  // Validate dependsOn references and self-references
  for (const task of data.tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        ctx.addIssue({
          code: 'custom', path: ['tasks'],
          message: `Task ${task.id} depends on non-existent task ${dep}`,
        });
      }
    }
    if (task.dependsOn.includes(task.id)) {
      ctx.addIssue({
        code: 'custom', path: ['tasks'],
        message: `Task ${task.id} cannot depend on itself`,
      });
    }
  }

  // Validate no duplicate task IDs
  if (taskIds.size !== data.tasks.length) {
    ctx.addIssue({
      code: 'custom', path: ['tasks'],
      message: 'Duplicate task IDs detected',
    });
  }

  // DAG cycle detection via DFS 3-color marking
  // NOTE: This is a lightweight detection-only check for Zod schema validation (L2).
  // It does NOT reconstruct the cycle path -- it just rejects the artifact.
  // The full cycle path reconstruction (for ValidationError.cyclePath in Section 5.2.2)
  // is implemented in src/dag/static/validator.ts, which maintains a path stack
  // during DFS traversal. The validator provides detailed error messages;
  // the schema provides early rejection.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const t of data.tasks) color.set(t.id, WHITE);
  const adj = new Map<string, string[]>();
  for (const t of data.tasks) adj.set(t.id, t.dependsOn.filter(d => taskIds.has(d)));

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) return true;
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const t of data.tasks) {
    if (color.get(t.id) === WHITE && dfs(t.id)) {
      ctx.addIssue({
        code: 'custom', path: ['tasks'],
        message: 'Cycle detected in task dependency graph',
      });
      break;
    }
  }
});
type TaskGraphArtifact = z.infer<typeof TaskGraphSchema>;
```

> **Naming note:** This `TaskGraphArtifact` type represents the *serialized YAML artifact* (with `version`, `generated`, `checksum`, `project`, `tasks` fields). It is distinct from the `TaskGraph` interface in Section 5.3, which is the *in-memory DAG structure* (with `nodes`, `edges`, `layers`, `fileConflicts`, `criticalPath` fields). The artifact schema validates output files; the DAG interface drives runtime execution.

#### 10.7.3 RepoBlueprintSchema

The repo blueprint uses a recursive `z.lazy()` pattern for the tree structure, with `.superRefine()` constraints ensuring files do not have children and directories do not have language fields.

```typescript
// Contract: implement exactly as specified
interface RepoBlueprintNode {
  name: string;
  type: 'dir' | 'file';
  purpose: string;
  generatedBy?: string;
  language?: string;
  dependencies?: string[];
  children?: RepoBlueprintNode[];
}

const RepoBlueprintNode: z.ZodType<RepoBlueprintNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['dir', 'file']),
    purpose: z.string().min(1).max(500),
    generatedBy: TaskId.optional(),
    language: z.string().min(1).max(30).optional(),
    dependencies: z.array(z.string().min(1)).optional(),
    children: z.array(RepoBlueprintNode).optional(),
  }).superRefine((node, ctx) => {
    if (node.type === 'file' && node.children && node.children.length > 0) {
      ctx.addIssue({
        code: 'custom', path: ['children'],
        message: `File node "${node.name}" cannot have children`,
      });
    }
    if (node.type === 'dir' && node.language) {
      ctx.addIssue({
        code: 'custom', path: ['language'],
        message: `Directory node "${node.name}" should not have a language field`,
      });
    }
  })
);

const RepoBlueprintSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  projectName: z.string().min(1).max(200),
  root: z.array(RepoBlueprintNode).min(1),
});
type RepoBlueprint = z.infer<typeof RepoBlueprintSchema>;
```

#### 10.7.4 MpdSchema (Structured)

The MPD is a Markdown document, but its data model is validated by a Zod schema before Eta template rendering. The schema defines all 13 sections of the MPD as typed objects.

```typescript
// Contract: implement exactly as specified
const MermaidDiagram = z.object({
  type: z.enum([
    'flowchart', 'sequenceDiagram', 'erDiagram',
    'classDiagram', 'stateDiagram', 'gantt', 'graph',
  ]),
  title: z.string().min(1).max(200),
  source: z.string().min(10),
});

const MpdSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  executiveSummary: z.object({
    projectName: z.string().min(1),
    oneLiner: z.string().min(10).max(300),
    objectives: z.array(z.string().min(5)).min(1),
    targetAudience: z.array(z.string().min(1)).min(1),
    scope: z.object({
      inScope: z.array(z.string().min(5)).min(1),
      outOfScope: z.array(z.string().min(5)).min(1),
    }),
  }),
  projectOverview: z.object({
    background: z.string().min(20),
    problemStatement: z.string().min(20),
    proposedSolution: z.string().min(20),
    successCriteria: z.array(z.string().min(5)).min(1),
    assumptions: z.array(z.object({
      id: z.string().regex(/^ASMP-\d{3}$/),
      description: z.string().min(10),
      source: z.enum(['user', 'inferred', 'domain']),
    })).default([]),
  }),
  technicalArchitecture: z.object({
    overview: z.string().min(20),
    diagrams: z.array(MermaidDiagram).min(1),
    patterns: z.array(z.object({
      name: z.string().min(1),
      rationale: z.string().min(10),
      adrRef: AdrRef.optional(),
    })).min(1),
    techStack: z.array(z.object({
      name: z.string().min(1),
      version: z.string().optional(),
      purpose: z.string().min(1),
      category: z.enum([
        'language', 'framework', 'database',
        'infrastructure', 'tooling', 'library',
      ]),
    })).min(1),
  }),
  componentDesign: z.object({
    components: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(10),
      responsibilities: z.array(z.string().min(5)).min(1),
      interfaces: z.array(z.string()).default([]),
      dependencies: z.array(z.string()).default([]),
      taskRefs: z.array(TaskId).min(1),
    })).min(1),
    diagrams: z.array(MermaidDiagram).optional(),
  }),
  dataModel: z.object({
    overview: z.string().min(10),
    entities: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(10),
      fields: z.array(z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        constraints: z.string().optional(),
        description: z.string().optional(),
      })).min(1),
      relationships: z.array(z.string()).default([]),
    })).default([]),
    diagrams: z.array(MermaidDiagram).optional(),
  }),
  apiDesign: z.object({
    overview: z.string().min(10),
    endpoints: z.array(z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().min(1),
      description: z.string().min(5),
      taskRef: TaskId.optional(),
    })).default([]),
    authStrategy: z.string().optional(),
  }),
  securityConsiderations: z.object({
    overview: z.string().min(10),
    threatModel: z.array(z.object({
      threat: z.string().min(5),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      mitigation: z.string().min(5),
      taskRef: TaskId.optional(),
    })).default([]),
  }),
  testingStrategy: z.object({
    overview: z.string().min(10),
    levels: z.array(z.object({
      name: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']),
      description: z.string().min(10),
      tools: z.array(z.string().min(1)).min(1),
      coverageTarget: z.string().optional(),
    })).min(1),
    taskRefs: z.array(TaskId).default([]),
  }),
  deploymentPlan: z.object({
    overview: z.string().min(10),
    environments: z.array(z.object({
      name: z.string().min(1),
      purpose: z.string().min(5),
      infrastructure: z.string().optional(),
    })).min(1),
    cicdPipeline: z.string().optional(),
  }),
  riskAssessment: z.object({
    risks: z.array(z.object({
      id: z.string().regex(/^RISK-\d{3}$/),
      description: z.string().min(10),
      probability: z.enum(['high', 'medium', 'low']),
      impact: z.enum(['critical', 'major', 'minor']),
      mitigation: z.string().min(5),
    })).min(1),
  }),
  timeline: z.object({
    phases: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(5),
      taskRefs: z.array(TaskId).min(1),
    })).min(1),
    criticalPath: z.array(TaskId).min(1),
    diagram: MermaidDiagram.optional(),
  }),
  glossary: z.object({
    terms: z.array(z.object({
      term: z.string().min(1),
      definition: z.string().min(5),
    })).default([]),
  }),
  appendices: z.object({
    adrs: z.array(z.object({
      id: AdrRef,
      title: z.string().min(1),
      status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
      summary: z.string().min(10),
    })).default([]),
    references: z.array(z.object({
      title: z.string().min(1),
      url: z.string().url().optional(),
      description: z.string().optional(),
    })).default([]),
  }),
});
type Mpd = z.infer<typeof MpdSchema>;
```

#### 10.7.5 TicketSchema

Tickets use YAML frontmatter + Markdown body. The schema validates both parts.

```typescript
// Contract: implement exactly as specified
const GivenWhenThen = z.object({
  given: z.string().min(5),
  when: z.string().min(5),
  then: z.string().min(5),
});

const TicketFrontmatter = z.object({
  id: TaskId,
  title: z.string().min(3).max(200),
  type: TicketType,
  priority: TicketPriority,
  estimate: z.string().regex(/^\d+[hdw]$/, {
    error: 'Estimate must match format: <number><h|d|w> (e.g., 4h, 2d, 1w)',
  }),
  dependencies: z.array(TaskId).default([]),
  labels: z.array(z.string().min(1).max(30)).default([]),
  assignee: z.string().min(1).default('unassigned'),
  status: TicketStatus.default('backlog'),
});

const TicketSchema = z.object({
  frontmatter: TicketFrontmatter,
  body: z.object({
    description: z.string().min(20),
    acceptanceCriteria: z.array(GivenWhenThen).min(1),
    technicalNotes: z.string().min(10).optional(),
    relatedDecisions: z.array(AdrRef).default([]),
  }),
});
type Ticket = z.infer<typeof TicketSchema>;
```

**Dispute resolution -- Ticket frontmatter fields:** The content agent's examples include extra fields (`agent`, `blockedBy`, `blocks`) not present in the schema agent's `TicketFrontmatter`. The judge decision is to keep the schema agent's version as the canonical contract. The `agent` field is already captured in the task graph (not needed in the ticket). `blockedBy`/`blocks` are computed from the DAG and should not be duplicated in the ticket frontmatter (single source of truth principle). Content examples may include these as informal annotations, but they are not part of the validated schema.

#### 10.7.6 AiPromptPackSchema

The prompt pack schema validates the per-task AI prompt files with `.superRefine()` rules preventing self-references and enforcing sequential instruction steps.

```typescript
// Contract: implement exactly as specified
const OutputFileContract = z.object({
  filePath: RelativeFilePath,
  exports: z.array(z.string().min(1)).default([]),
  description: z.string().min(5),
});

const InputFile = z.object({
  filePath: RelativeFilePath,
  sourceTask: TaskId,
  description: z.string().min(5).optional(),
});

const InstructionStep = z.object({
  step: z.number().int().min(1),
  instruction: z.string().min(10),
});

const PreviousTaskOutput = z.object({
  taskId: TaskId,
  filePath: RelativeFilePath,
  injectionPoint: z.string().min(1),
  mode: z.enum(['full', 'summary', 'reference']).default('reference'),
});

const AiPromptPackSchema = z.object({
  taskId: TaskId,
  taskName: z.string().min(3).max(120),
  context: z.string().min(20),
  contract: z.object({
    outputFiles: z.array(OutputFileContract).min(1),
    exports: z.array(z.string()).default([]),
    dependencies: z.array(z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      purpose: z.string().min(1).optional(),
    })).default([]),
  }),
  inputFiles: z.array(InputFile).default([]),
  instructions: z.array(InstructionStep).min(1),
  constraints: z.array(z.string().min(5)).min(1),
  testCriteria: z.array(z.string().min(5)).min(1),
  estimatedComplexity: Complexity,
  suggestedModel: SuggestedModel,
  previousTaskOutputs: z.array(PreviousTaskOutput).default([]),
}).superRefine((data, ctx) => {
  // No self-referencing input files
  for (const input of data.inputFiles) {
    if (input.sourceTask === data.taskId) {
      ctx.addIssue({
        code: 'custom', path: ['inputFiles'],
        message: `Input file "${input.filePath}" cannot reference its own task ${data.taskId}`,
      });
    }
  }
  // No self-referencing previous outputs
  for (const prev of data.previousTaskOutputs) {
    if (prev.taskId === data.taskId) {
      ctx.addIssue({
        code: 'custom', path: ['previousTaskOutputs'],
        message: `Previous task output cannot reference own task ${data.taskId}`,
      });
    }
  }
  // Sequential instruction steps
  for (let i = 0; i < data.instructions.length; i++) {
    if (data.instructions[i].step !== i + 1) {
      ctx.addIssue({
        code: 'custom', path: ['instructions'],
        message: `Instruction step ${i + 1} has step number ${data.instructions[i].step} (must be sequential)`,
      });
      break;
    }
  }
});
type AiPromptPack = z.infer<typeof AiPromptPackSchema>;
```

#### 10.7.7 AdrSchema (MADR v4.0)

Architecture Decision Records produced by the debate engine conform to MADR v4.0.0 format. This schema is used for standalone ADR files, the feedback API's decision detail endpoint, and debate engine output.

```typescript
// Contract: implement exactly as specified
const AdrSchema = z.object({
  id: AdrRef,
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decisionMakers: z.string().optional(),
  consulted: z.string().optional(),
  informed: z.string().optional(),
  title: z.string().min(5),
  context: z.string().min(20),
  decisionDrivers: z.array(z.string().min(5)).optional(),
  options: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    pros: z.array(z.string().min(1)).default([]),
    neutral: z.array(z.string().min(1)).default([]),
    cons: z.array(z.string().min(1)).default([]),
  })).min(2),
  chosenOption: z.string().min(1),
  rationale: z.string().min(10),
  consequences: z.array(z.object({
    type: z.enum(['good', 'bad']),
    description: z.string().min(5),
  })).optional(),
  confirmation: z.string().optional(),
  moreInformation: z.string().optional(),
  // ATSF extensions
  debateRef: z.string().optional(),
  consensusScore: z.number().min(0).max(1).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  relatedTasks: z.array(TaskId).default([]),
}).superRefine((data, ctx) => {
  const optionNames = data.options.map(o => o.name);
  if (!optionNames.includes(data.chosenOption)) {
    ctx.addIssue({
      code: 'custom', path: ['chosenOption'],
      message: `Chosen option "${data.chosenOption}" must match one of: ${optionNames.join(', ')}`,
    });
  }
});
type Adr = z.infer<typeof AdrSchema>;
```

#### 10.7.8 ManifestSchema

The manifest is the final emitter output, listing all generated files with checksums for integrity verification.

```typescript
// Contract: implement exactly as specified
const ManifestSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  atsfVersion: SemVer,  // Full N.N.N semantic version
  projectName: z.string().min(1),
  files: z.array(z.object({
    path: RelativeFilePath,
    checksum: Checksum,
    sizeBytes: z.number().int().nonnegative(),
    // See ArtifactType in Section 10.6 for the canonical list.
    artifactType: z.enum([
      'task_graph', 'repo_blueprint', 'mpd',
      'tickets', 'ai_prompt_pack', 'manifest',
    ]),
  })).min(1),
  totalTasks: z.number().int().min(1),
  totalCostUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});
type Manifest = z.infer<typeof ManifestSchema>;
```

#### 10.7.9 TypeScript Type Exports

All schemas export their inferred TypeScript types:

```typescript
// Contract: implement exactly as specified
export type { TaskGraph, RepoBlueprint, Mpd, Ticket, AiPromptPack, Adr, Manifest };
```

> Source: Schema agent (artifact-schemas.ts); consistent with Section 8 (Zod v4.3.6+ syntax).

### 10.8 Cross-Reference Specification

ATSF artifacts do not exist in isolation. They reference each other extensively, and these cross-references must be validated for consistency. The cross-reference specification defines 13 rules that are enforced during L3 (cross-agent) validation and the emitter pipeline's final consistency check.

#### 10.8.1 Cross-Reference Rules

```typescript
// Contract: implement exactly as specified
const CrossReferenceRule = z.object({
  id: z.string().regex(/^XREF-\d{3}$/),
  name: z.string().min(5),
  // See ArtifactType in Section 10.6. manifest excluded: cross-references are between content artifacts.
  sourceArtifact: z.enum([
    'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
  ]),
  sourceField: z.string().min(1),
  targetArtifact: z.enum([
    'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
  ]),
  targetField: z.string().min(1),
  cardinality: z.enum(['1:1', '1:N', 'N:1', 'N:N']),
  severity: z.enum(['error', 'warning']),
  description: z.string().min(10),
});
```

#### 10.8.2 The 13 Cross-Reference Rules

| ID | Name | Source -> Target | Cardinality | Severity |
|----|------|------------------|-------------|----------|
| XREF-001 | TaskGraph-to-Tickets 1:1 mapping | `task_graph.tasks[].id` -> `tickets.frontmatter.id` | 1:1 | error |
| XREF-002 | TaskGraph-to-PromptPack 1:1 mapping | `task_graph.tasks[].id` -> `ai_prompt_pack.taskId` | 1:1 | error |
| XREF-003 | RepoBlueprint generatedBy references TaskGraph | `repo_blueprint.root[].generatedBy` -> `task_graph.tasks[].id` | N:1 | error |
| XREF-004 | Ticket dependencies match TaskGraph dependsOn | `tickets.frontmatter.dependencies` -> `task_graph.tasks[].dependsOn` | N:N | error |
| XREF-005 | PromptPack inputFiles.sourceTask references TaskGraph | `ai_prompt_pack.inputFiles[].sourceTask` -> `task_graph.tasks[].id` | N:1 | error |
| XREF-006 | PromptPack previousTaskOutputs.taskId references TaskGraph | `ai_prompt_pack.previousTaskOutputs[].taskId` -> `task_graph.tasks[].id` | N:1 | error |
| XREF-007 | MPD taskRefs reference TaskGraph | `mpd.*.taskRefs[]` -> `task_graph.tasks[].id` | N:1 | error |
| XREF-008 | MPD ADR refs match Appendices | `mpd.technicalArchitecture.patterns[].adrRef` -> `mpd.appendices.adrs[].id` | N:1 | warning |
| XREF-009 | Ticket relatedDecisions reference ADRs | `tickets.body.relatedDecisions` -> `adrs[].id` (from `ArtifactSet.adrs`) | N:N | warning |
| XREF-010 | PromptPack contract.outputFiles match TaskGraph filesWrite | `ai_prompt_pack.contract.outputFiles[].filePath` -> `task_graph.tasks[].filesWrite` | N:N | error |
| XREF-011 | PromptPack inputFiles.filePath match TaskGraph filesRead | `ai_prompt_pack.inputFiles[].filePath` -> `task_graph.tasks[].filesRead` | N:N | error |
| XREF-012 | MPD timeline.criticalPath tasks exist in TaskGraph | `mpd.timeline.criticalPath` -> `task_graph.tasks[].id` | N:1 | error |
| XREF-013 | RepoBlueprint files cover TaskGraph filesWrite | `repo_blueprint (flattened)` -> `task_graph.tasks[].filesWrite (union)` | N:N | warning |

#### 10.8.3 CrossReferenceValidator Interface

```typescript
// Contract: implement exactly as specified
interface CrossRefViolation {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning';
  message: string;
  offendingValues: string[];
}

interface CrossRefValidationResult {
  valid: boolean;
  errors: CrossRefViolation[];
  warnings: CrossRefViolation[];
}

/**
 * ArtifactSet holds deserialized + Zod-validated artifact data.
 * taskGraph is the parsed TaskGraphArtifact (Section 10.7.2), not the
 * in-memory DAG from Section 5.3. The emitter pipeline produces
 * TaskGraphArtifact; the cross-reference validator consumes it here.
 * Use TaskGraphArtifact's .tasks[], .metadata, etc. fields for validation.
 */
interface ArtifactSet {
  taskGraph: TaskGraphArtifact;    // from Section 10.7.2 (serialized/validated form)
  repoBlueprint: RepoBlueprint;
  mpd: Mpd;
  tickets: Ticket[];
  promptPacks: AiPromptPack[];
  adrs: Adr[];                     // from decisions/*.yaml, validated by AdrSchema (Section 10.7.7)
}

function validateCrossReferences(artifacts: ArtifactSet): CrossRefValidationResult;
```

The validator implements all 13 rules, walking the artifact tree to collect references and comparing them against the target artifact's identifiers. Rules with severity `error` cause the emitter pipeline to fail; rules with severity `warning` are logged but do not block output.

> Source: Schema agent (cross-reference-validator.ts); consistent with Section 7.3.2 (Consistency Gate).

### 10.9 Realistic Output Examples

This section provides complete, realistic examples of all 6 artifact types based on the **TaskFlow** project -- a task management SaaS API with real-time updates, RBAC, and REST/WebSocket interfaces.

#### 10.9.1 task_graph.yaml (Complete -- 12 Tasks)

```yaml
## TaskFlow -- Complete task_graph.yaml Example
## Generated by ATSF v1.0.0
## Validates against TaskGraphSchema in artifact-schemas.ts

version: "1.0"
generated: "2026-02-25T14:30:00Z"
checksum: "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"

project:
  name: "TaskFlow"
  description: >-
    A task management SaaS API with real-time updates, role-based access
    control, and REST/WebSocket interfaces built on Node.js/Express
    and PostgreSQL
  techStack:
    - name: "Node.js"
      version: ">= 20.x LTS"
      purpose: "Runtime environment"
    - name: "Express"
      version: "^4.21"
      purpose: "HTTP framework"
    - name: "PostgreSQL"
      version: ">= 16.x"
      purpose: "Relational database"
    - name: "TypeScript"
      version: "^5.7"
      purpose: "Type-safe JavaScript"
    - name: "Kysely"
      version: "^0.27"
      purpose: "Type-safe SQL query builder"
    - name: "Zod"
      version: "^4.3"
      purpose: "Runtime request validation"
  constraints:
    - "No ORM -- use SQL query builder per ADR-001"
    - "Stateless JWT authentication -- no server-side sessions"
    - "PostgreSQL only -- no Redis or other stores in MVP"
    - "REST + WebSocket only -- no GraphQL"

tasks:
  - id: TASK-001
    name: "Design database schema and entity relationships"
    description: >-
      Define the complete PostgreSQL database schema for TaskFlow including
      users, projects, tasks, and project_members entities with column types,
      constraints, indexes, and relationships.
    agent: planner
    type: architecture
    dependsOn: []
    filesWrite:
      - "docs/database-schema.yaml"
      - "docs/erd.md"
    filesRead:
      - "requirements.md"
    priority: 5
    estimatedTokens: 3000
    category: "database-architecture"
    acceptanceCriteria:
      - description: "All four entities defined with complete column specifications"
        testable: true
      - description: "UUIDs for all primary keys, TIMESTAMPTZ for all timestamps"
        testable: true
      - description: "Foreign keys have appropriate ON DELETE behavior"
        testable: true
      - description: "Indexes defined for all common query patterns"
        testable: true
    tags: [database, architecture]

  - id: TASK-002
    name: "Define REST API endpoints and request/response contracts"
    description: >-
      Define the complete REST API specification for TaskFlow including all
      endpoints, HTTP methods, request/response schemas, authentication
      requirements, error formats, pagination, and filtering.
    agent: planner
    type: architecture
    dependsOn: [TASK-001]
    filesWrite:
      - "docs/api-spec.yaml"
      - "docs/api-examples.md"
    filesRead:
      - "docs/database-schema.yaml"
      - "requirements.md"
    priority: 5
    estimatedTokens: 4000
    category: "api-design"
    acceptanceCriteria:
      - description: "Every entity has complete CRUD endpoints"
        testable: true
      - description: "Auth endpoints specified with full request/response schemas"
        testable: true
      - description: "Pagination, filtering, and sorting parameters documented"
        testable: true
      - description: "Error response format consistent across all endpoints"
        testable: true
    tags: [api, backend]

  - id: TASK-003
    name: "Design JWT authentication and RBAC strategy"
    description: >-
      Design the authentication and authorization strategy including JWT token
      lifecycle, signing configuration, refresh token rotation, Express middleware
      integration, and a three-tier RBAC permission matrix.
    agent: critic
    type: security
    dependsOn: [TASK-001]
    filesWrite:
      - "docs/auth-strategy.md"
      - "docs/rbac-matrix.yaml"
    filesRead:
      - "docs/database-schema.yaml"
      - "requirements.md"
    priority: 5
    estimatedTokens: 3500
    category: "security"
    acceptanceCriteria:
      - description: "JWT configuration specifies algorithm, secret source, and expiry"
        testable: true
      - description: "Refresh token rotation mechanism includes theft detection"
        testable: true
      - description: "RBAC matrix covers every role x resource x action combination"
        testable: true
      - description: "Non-member access returns 404 to prevent project enumeration"
        testable: true
    tags: [security, authentication, authorization]

  - id: TASK-004
    name: "Design WebSocket real-time event system"
    agent: planner
    type: architecture
    description: >-
      Design the WebSocket server architecture for TaskFlow including connection
      lifecycle, authentication via JWT, subscription model for project channels,
      event type definitions, and heartbeat mechanism.
    dependsOn: [TASK-001]
    filesWrite:
      - "docs/websocket-spec.md"
      - "docs/event-types.yaml"
    filesRead:
      - "docs/database-schema.yaml"
      - "requirements.md"
    priority: 4
    estimatedTokens: 2500
    category: "real-time"
    acceptanceCriteria:
      - description: "WebSocket connection lifecycle fully documented"
        testable: true
      - description: "Event types for task/project changes defined with payload schemas"
        testable: true
      - description: "Heartbeat ping/pong mechanism with timeout specified"
        testable: true
    tags: [websocket, real-time]

  - id: TASK-005
    name: "Debate: SQL query builder vs ORM for data access"
    agent: judge
    type: review
    description: >-
      Conduct a structured debate between SQL query builder (Kysely) and ORM
      (Drizzle, Prisma) approaches. Produce an Architecture Decision Record.
    dependsOn: [TASK-001, TASK-002]
    filesWrite:
      - "decisions/ADR-001-data-access-pattern.md"
    filesRead:
      - "docs/database-schema.yaml"
      - "docs/api-spec.yaml"
    priority: 4
    estimatedTokens: 5000
    category: "architecture-decision"
    acceptanceCriteria:
      - description: "ADR follows MADR v4 format"
        testable: true
      - description: "At least two options evaluated with explicit pros and cons"
        testable: true
      - description: "Final decision includes rationale and dissenting opinions"
        testable: true
    tags: [architecture, database, adr]

  - id: TASK-006
    name: "Implement database migrations and seed data"
    agent: builder
    type: feature
    description: >-
      Create PostgreSQL migration SQL files for all entities, a connection
      module using pg with Kysely, and seed data for development/testing.
    dependsOn: [TASK-001, TASK-005]
    filesWrite:
      - "src/db/migrations/001_create_users.sql"
      - "src/db/migrations/002_create_projects.sql"
      - "src/db/migrations/003_create_tasks.sql"
      - "src/db/migrations/004_create_project_members.sql"
      - "src/db/seeds/001_seed_users.sql"
      - "src/db/seeds/002_seed_projects.sql"
      - "src/db/connection.ts"
    filesRead:
      - "docs/database-schema.yaml"
      - "decisions/ADR-001-data-access-pattern.md"
    priority: 4
    estimatedTokens: 4000
    category: "database"
    acceptanceCriteria:
      - description: "Migration files create all four tables with correct constraints"
        testable: true
      - description: "Connection module exports a configured Kysely instance"
        testable: true
      - description: "Seed data includes at least one admin user and sample project"
        testable: true
    tags: [database, backend]

  - id: TASK-007
    name: "Implement authentication middleware and JWT utilities"
    agent: builder
    type: feature
    description: >-
      Implement Express authentication middleware, RBAC middleware, and utility
      functions for JWT signing/verification and password hashing.
    dependsOn: [TASK-003, TASK-006]
    filesWrite:
      - "src/middleware/auth.ts"
      - "src/middleware/rbac.ts"
      - "src/utils/jwt.ts"
      - "src/utils/password.ts"
    filesRead:
      - "docs/auth-strategy.md"
      - "docs/rbac-matrix.yaml"
      - "src/db/connection.ts"
    priority: 4
    estimatedTokens: 3500
    category: "authentication"
    acceptanceCriteria:
      - description: "Auth middleware extracts and verifies JWT from Authorization header"
        testable: true
      - description: "RBAC middleware checks project membership and role hierarchy"
        testable: true
      - description: "Password utility uses bcrypt with 12 salt rounds"
        testable: true
      - description: "JWT utility signs tokens with HS256 and configurable expiry"
        testable: true
    tags: [security, authentication, backend]

  - id: TASK-008
    name: "Implement user CRUD API routes"
    agent: builder
    type: feature
    description: >-
      Implement Express route handlers for user management including auth
      endpoints, profile endpoints, Zod validation, and Express app factory.
    dependsOn: [TASK-002, TASK-006, TASK-007]
    filesWrite:
      - "src/routes/users.ts"
      - "src/routes/index.ts"
      - "src/validators/users.ts"
      - "src/middleware/error-handler.ts"
      - "src/middleware/request-logger.ts"
      - "src/app.ts"
    filesRead:
      - "docs/api-spec.yaml"
      - "docs/auth-strategy.md"
      - "src/db/connection.ts"
      - "src/middleware/auth.ts"
    priority: 3
    estimatedTokens: 3500
    category: "api-implementation"
    acceptanceCriteria:
      - description: "Registration endpoint validates input, hashes password, returns JWT"
        testable: true
      - description: "Login endpoint verifies credentials and returns token pair"
        testable: true
      - description: "Profile endpoints require authentication"
        testable: true
      - description: "Zod validation rejects invalid input with descriptive errors"
        testable: true
    tags: [api, backend]

  - id: TASK-009
    name: "Implement project and task CRUD API routes"
    agent: builder
    type: feature
    description: >-
      Implement Express route handlers for project CRUD and task CRUD with
      RBAC middleware, filtering, pagination, and sorting.
    dependsOn: [TASK-002, TASK-006, TASK-007]
    filesWrite:
      - "src/routes/projects.ts"
      - "src/routes/tasks.ts"
      - "src/validators/projects.ts"
      - "src/validators/tasks.ts"
    filesRead:
      - "docs/api-spec.yaml"
      - "docs/auth-strategy.md"
      - "docs/rbac-matrix.yaml"
      - "src/db/connection.ts"
      - "src/middleware/auth.ts"
      - "src/middleware/rbac.ts"
    priority: 3
    estimatedTokens: 5000
    category: "api-implementation"
    acceptanceCriteria:
      - description: "Project CRUD enforces admin role for write operations"
        testable: true
      - description: "Task list supports filtering by status, assigneeId, priority"
        testable: true
      - description: "Non-members receive 404 when accessing projects"
        testable: true
      - description: "Member management restricted to project admins"
        testable: true
    tags: [api, backend]

  - id: TASK-010
    name: "Implement WebSocket server and event broadcasting"
    agent: builder
    type: feature
    description: >-
      Implement the WebSocket server using ws library, including JWT auth on
      upgrade, project channel subscription, event broadcasting, and heartbeat.
    dependsOn: [TASK-004, TASK-007]
    filesWrite:
      - "src/ws/server.ts"
      - "src/ws/handlers.ts"
      - "src/ws/events.ts"
      - "src/server.ts"
    filesRead:
      - "docs/websocket-spec.md"
      - "docs/event-types.yaml"
      - "src/middleware/auth.ts"
    priority: 3
    estimatedTokens: 3500
    category: "real-time"
    acceptanceCriteria:
      - description: "WebSocket connections authenticated via JWT"
        testable: true
      - description: "Clients can subscribe and unsubscribe to project channels"
        testable: true
      - description: "State changes are broadcast to subscribed connections"
        testable: true
      - description: "Heartbeat ping/pong every 30s with disconnect after 2 missed"
        testable: true
    tags: [websocket, real-time, backend]

  - id: TASK-011
    name: "Implement integration tests for API and WebSocket"
    agent: reviewer
    type: testing
    description: >-
      Create integration tests using Vitest and supertest for all API endpoints
      and WebSocket functionality with test database setup/teardown.
    dependsOn: [TASK-008, TASK-009, TASK-010]
    filesWrite:
      - "tests/integration/users.test.ts"
      - "tests/integration/projects.test.ts"
      - "tests/integration/tasks.test.ts"
      - "tests/integration/ws.test.ts"
      - "tests/helpers/setup.ts"
      - "tests/helpers/fixtures.ts"
      - "vitest.config.ts"
    filesRead:
      - "src/routes/users.ts"
      - "src/routes/projects.ts"
      - "src/routes/tasks.ts"
      - "src/ws/server.ts"
      - "docs/api-spec.yaml"
      - "docs/websocket-spec.md"
    priority: 2
    estimatedTokens: 5000
    category: "testing"
    acceptanceCriteria:
      - description: "Each endpoint has at least one happy-path and one error-path test"
        testable: true
      - description: "RBAC tests verify unauthorized access returns correct status"
        testable: true
      - description: "WebSocket tests verify connection auth and event delivery"
        testable: true
      - description: "Test setup creates isolated database schema per suite"
        testable: true
    tags: [testing, integration]

  - id: TASK-012
    name: "Create deployment configuration and CI/CD pipeline"
    agent: integrator
    type: infrastructure
    description: >-
      Create multi-stage Dockerfile, docker-compose.yaml, GitHub Actions CI
      workflow, environment variable documentation, and health check endpoint.
    dependsOn: [TASK-011]
    filesWrite:
      - "Dockerfile"
      - "docker-compose.yaml"
      - ".github/workflows/ci.yaml"
      - ".env.example"
      - "docs/deployment-guide.md"
    filesRead:
      - "src/server.ts"
      - "package.json"
      - "vitest.config.ts"
    priority: 1
    estimatedTokens: 3000
    category: "devops"
    acceptanceCriteria:
      - description: "Dockerfile uses multi-stage build with non-root user"
        testable: true
      - description: "docker-compose.yaml runs app and PostgreSQL with persistent volume"
        testable: true
      - description: "CI pipeline runs lint, test, and build on push and PR"
        testable: true
      - description: "All required environment variables documented in .env.example"
        testable: true
    tags: [devops, ci-cd, deployment]
```

#### 10.9.2 Ticket Examples

**TASK-001 Ticket:**

```markdown
---
id: TASK-001
title: "Design database schema and entity relationships"
type: architecture
priority: critical
estimate: "3h"
dependencies: []
labels:
  - database
  - architecture
assignee: planner
status: backlog
---

## Description

Design the complete PostgreSQL database schema for the TaskFlow application.
This is the foundational task -- all downstream tasks depend on these entities.

## Acceptance Criteria

- given: "The requirements document is available"
  when: "The database schema is designed"
  then: "All four entities are defined with complete column specifications"

- given: "The entity definitions are finalized"
  when: "Column types are specified"
  then: "UUIDs for all PKs, TIMESTAMPTZ for all timestamps"

- given: "The tasks entity is defined"
  when: "Foreign keys are configured"
  then: "project_id has ON DELETE CASCADE, assignee_id has ON DELETE SET NULL"

## Technical Notes

- Use PostgreSQL 16.x features (gen_random_uuid() built-in)
- Status/role fields use VARCHAR(20), not ENUM (easier to extend)
- All timestamps must use TIMESTAMPTZ (not TIMESTAMP)

## Related Decisions

- ADR-001 (data access pattern, decided in TASK-005)
```

**TASK-003 Ticket:**

```markdown
---
id: TASK-003
title: "Design JWT authentication and RBAC strategy"
type: architecture
priority: critical
estimate: "4h"
dependencies:
  - TASK-001
labels:
  - security
  - authentication
  - authorization
assignee: critic
status: backlog
---

## Description

Design the complete authentication and authorization strategy for TaskFlow.
The critic agent is assigned because the output must consider attack vectors,
edge cases, and failure modes.

## Acceptance Criteria

- given: "JWT configuration is specified"
  when: "The document is reviewed"
  then: "Algorithm (HS256), secret source, access token expiry (15 min), and
         refresh token expiry (7 days) are all explicitly documented"

- given: "The refresh token mechanism is designed"
  when: "A refresh is performed"
  then: "Old refresh token is invalidated with theft detection"

- given: "The RBAC matrix is defined"
  when: "Permissions are checked"
  then: "Every role x resource x action combination has explicit allow/deny"

- given: "A non-member attempts to access a project"
  when: "The RBAC check fails"
  then: "Response is 404 Not Found (not 403)"

## Technical Notes

- JWT payload: { sub: userId, role: globalRole, iat, exp }
- Project-level roles checked against project_members table at request time
- Global admin role bypasses project-level RBAC
```

#### 10.9.3 AI Prompt Pack Example (TASK-003)

```markdown
# Task: TASK-003 -- Design JWT authentication and RBAC strategy

> Auto-generated by ATSF v1.0.0 | Do not edit manually

## Structured Data (AiPromptPackSchema)

taskId: TASK-003
taskName: "Design JWT authentication and RBAC strategy"
estimatedComplexity: high
suggestedModel: powerful

## Context

You are designing the authentication and authorization strategy for
**TaskFlow**, a task management SaaS API. The system uses Node.js/Express
with TypeScript, PostgreSQL, JWT for stateless auth, and three-tier RBAC
(admin, member, viewer).

Your role is **critic agent** -- think adversarially about attack vectors
and failure modes.

## Contract

### Output Files
1. `docs/auth-strategy.md` -- JWT signing config, token lifecycle, refresh
   rotation, middleware integration, security trade-offs
2. `docs/rbac-matrix.yaml` -- Three roles, permissions across all resources
   and actions, global admin override, non-member response policy

### Dependencies
- jsonwebtoken: ^9.0
- bcrypt: ^5.1
- express: ^4.21

## Input Files (Read-Only)
1. `docs/database-schema.yaml` (from TASK-001)
2. `requirements.md` (from project root)

## Instructions
1. Design JWT token structure with HS256, configurable secret and expiry
2. Design refresh token rotation with theft detection
3. Design RBAC permission matrix for all role x resource x action combos
4. Design Express middleware chain (requireAuth, requireRole)
5. Document security trade-offs (stateless JWT limitations, bcrypt timing)

## DO NOT
- Do not use RS256 or asymmetric algorithms
- Do not store refresh tokens only in memory
- Do not include sensitive data in JWT payload
- Do not recommend localStorage for token storage
- Do not design OAuth/SSO flows (out of MVP scope)
- Do not modify files outside docs/auth-strategy.md and docs/rbac-matrix.yaml

## Test Criteria
- Auth strategy covers all 5 sections
- RBAC matrix has explicit allow/deny for every combination
- JWT payload contains only sub, role, iat, exp
- Refresh rotation includes theft detection
- Non-member behavior documented as 404

## Previous Task Outputs
- TASK-001: docs/database-schema.yaml (summary mode)
```

#### 10.9.4 MPD Template (13 Sections)

The MPD follows a fixed 13-section structure. A complete filled example for TaskFlow is provided as `examples/MPD.md` in the ATSF output. The sections are:

1. **Executive Summary** -- Project name, key decisions, scope in/out
2. **Project Overview** -- Goals, scope detail, assumptions table
3. **Technical Architecture** -- Tech stack, patterns, Mermaid diagrams
4. **Component Design** -- Per-module responsibilities and interfaces
5. **Data Model** -- Entity definitions, ERD, index specifications
6. **API Design** -- Endpoint tables, request/response examples
7. **Security Considerations** -- OWASP mitigations, RBAC matrix, auth strategy
8. **Testing Strategy** -- Test pyramid, setup, test cases by component
9. **Deployment Plan** -- Environments, Docker config, CI/CD, env vars
10. **Risk Assessment** -- Risk table with probability/impact/mitigation
11. **Timeline & Milestones** -- Execution layers, milestones, critical path
12. **Glossary** -- Term definitions
13. **Appendices** -- ADR index, external references, artifact cross-references

> Source: Content agent (examples/); schema agent (MpdSchema); feedback agent (cross-examination alignment).

---

## 11. Dependencies & Versions (Validated)

All versions have been verified against npm registry as of February 2026. Corrections from original agent findings are noted.

### 11.1 Runtime Dependencies

| Package | Version | Purpose | Section | Correction |
|---------|---------|---------|---------|------------|
| `@oclif/core` | ^4.8.0 | CLI framework | Section 3 (CLI) | **CORRECTED:** was Commander.js (version corrected: 4.22.x belongs to `oclif` CLI tool, not `@oclif/core`) |
| `@oclif/plugin-help` | ^6.0.0 | CLI help command | CLI correction | New addition |
| `@oclif/plugin-plugins` | ^5.0.0 | CLI plugin management | CLI correction | New addition |
| `ai` | ^5.0.0 | Vercel AI SDK (structured output) | Section 4 (Provider) | **CORRECTED:** pinned to v5, not v6 |
| `@openrouter/ai-sdk-provider` | ^2.2.3 | OpenRouter AI SDK provider | Section 4 (Provider) | Verified |
| `zod` | ^4.3.6 | Schema validation | Section 8 (Contracts) | **CORRECTED:** was unspecified (v3) |
| `cosmiconfig` | ^9.0.0 | Config file loading | Section 3.4 (Config) | Verified (v9) |
| `cosmiconfig-typescript-loader` | ^6.2.0 | TS config file support | Section 3.4 (Config) | Verified |
| `eta` | ^4.5.1 | Template engine | Section 10.1 (Templates) | **CORRECTED:** was v3.x |
| `yaml` | ^2.8.2 | YAML generation | Section 10.2 (YAML) | Verified |
| `dependency-graph` | ^1.0.0 | Graph data structure | Section 5 (DAG) | Verified (stale but adequate) |
| `micromatch` | ^4.0.0 | Glob pattern matching | Section 5 (DAG) | Verified |
| `p-queue` | ^9.1.0 | Priority queue (ESM-only) | Section 9 (Parallel) | **CORRECTED:** was "v8+" |
| `ora` | ^8.0.0 | CLI spinners | Section 3.5 (UI) | Verified |
| `ink` | ^5.0.0 | Rich terminal UI (optional) | Section 3.5 (UI) | Verified |
| `pino` | ^9.0.0 | Structured logging | Section 3.6 (Logging) | Verified |
| `pino-pretty` | ^13.0.0 | Log formatting (dev) | Section 3.6 (Logging) | Verified |
| `chalk` | ^5.0.0 | Terminal colors | Section 3.5 (UI) | Verified |
| `fastify` | ^5.0.0 | HTTP server for `atsf serve` | Section 15 | New (feedback loop) |
| `@fastify/cors` | ^11.0.0 | CORS support for local dev | Section 15 | New (feedback loop) |
| `wink-bm25-text-search` | ^3.1.0 | In-memory BM25 search | Section 15 | New (feedback loop, latest: 3.1.2) |
| `chokidar` | ^4.0.0 | File watching for `--watch` mode | Section 15 | New (feedback loop) |
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server SDK (optional peer) | Section 15 | New (feedback loop) |

### 11.2 Development Dependencies

| Package | Version | Purpose | Section |
|---------|---------|---------|---------|
| `typescript` | ^5.7.0 | Language | All sections |
| `vitest` | ^3.0.0 | Testing | Section 14.4 (Testing) |
| `@oclif/test` | ^4.0.0 | CLI testing | CLI correction |
| `oclif` | ^4.0.0 | CLI build tool | CLI correction |
| `fast-check` | ^3.0.0 | Property-based testing | Section 7 (Gates) |

### 11.3 Module Format

ATSF is an **ESM-first** project:
- `"type": "module"` in `package.json`
- Node.js >= 20.0.0 required
- p-queue v9 is ESM-only (compatible)
- Oclif v4 supports dual CJS/ESM
- Eta v4.5.1 supports dual CJS/ESM

---

## 12. MVP Roadmap

The MVP is delivered in 4 phases. The scope is deliberately constrained: 8 agents, 1 provider (OpenRouter), file output only.

### Phase 1: Foundation (Weeks 1-2)

| Deliverable | Details |
|-------------|---------|
| Project scaffolding | Oclif project, TypeScript config, Vitest setup, ESM |
| CLI commands (stubs) | 9 commands: init, plan, debate, build, gate, emit, serve, query, review |
| Config system | cosmiconfig + Zod schema validation |
| Contract schemas | Agent output schema (9 fields), versioned envelope |
| EventBus | Implementation with 22 event types |
| Provider adapter (OpenRouter) | AI SDK v5 integration, `generateObject()` |

### Phase 2: Core Pipeline (Weeks 3-5)

| Deliverable | Details |
|-------------|---------|
| DAG static layer | GraphBuilder, Validator, ConflictDetector, topological sort |
| DAG runtime layer | DAGScheduler, TaskExecutor, FileLockManager |
| Resilience layer | Rate limiter, circuit breaker, semaphore, cost tracker |
| Debate engine | 3-round protocol, judge synthesis |
| ADR generation | MADR v4 templates via Eta |

### Phase 3: Quality & Output (Weeks 6-7)

| Deliverable | Details |
|-------------|---------|
| Quality gates | 5 gates (coverage, consistency, testability, buildability, security) |
| Auto-fix engine | Declarative fixes, max 3 rounds |
| Emitter pipeline | 6 artifact types (including manifest) |
| VirtualFS | Atomic flush to disk |
| Deterministic output | Sorted YAML, content hashing |

### Phase 4: Polish & Launch (Week 8)

| Deliverable | Details |
|-------------|---------|
| Rich CLI UI | ink dashboard with progress, cost, provider health |
| Reporting | Console, JSON, Markdown, JUnit gate reports |
| Documentation | User guide, architecture guide, API reference |
| Testing | Integration tests, golden file tests, snapshot tests |
| Publishing | npm package, global install support |

### MVP Agent Roster (8 Agents)

| Agent Type | Role | Provider |
|------------|------|----------|
| Planner | Decomposes project into tasks | OpenRouter |
| Architect | Defines system architecture | OpenRouter |
| Critic | Reviews and challenges proposals | OpenRouter |
| Judge | Synthesizes debate decisions | OpenRouter |
| Builder | Generates detailed task specifications | OpenRouter |
| Reviewer | Quality checks individual outputs | OpenRouter |
| Documenter | Generates MPD sections | OpenRouter |
| Integrator | Ensures cross-task consistency | OpenRouter |

> Source: MVP roadmap and scope definition (Section 12).

---

## 13. Competitive Positioning

### 13.1 Market Landscape

The competitive analysis examined 10 tools across the AI-assisted development space:

| Tool | Category | ATSF Overlap |
|------|----------|--------------|
| MetaGPT | Multi-agent code generation | Partial (multi-agent, but targets code, not specs) |
| AutoGen | Agent conversation framework | Minimal (framework, not tool) |
| CrewAI | Agent orchestration | Partial (orchestration pattern similar) |
| ChatDev | Simulated software company | Partial (role-based agents) |
| OpenHands | Open-source AI developer | Minimal (code-focused) |
| SWE-Agent | Bug fix automation | None |
| Aider | AI pair programming | None (code generation) |
| Cursor | AI-powered IDE | None (IDE, not CLI) |
| Copilot Workspace | GitHub AI workspace | Low (planning features, but code-oriented) |

### 13.2 ATSF's Unique Position

ATSF fills the **planning gap**: the space between "I have a project idea" and "I'm writing code." No competitor combines:
- Multi-agent debate for architectural decisions
- Quality gate validation of specifications
- DAG-scheduled parallel task decomposition
- Structured AI prompt packs for downstream tools

ATSF is complementary to code generation tools, not competitive with them. Its output (prompt packs, task graphs, tickets) feeds directly into Cursor, Aider, Claude Code, or any other code generation tool.

### 13.3 Category Definition

**AI Specification Engine:** A tool that uses AI agents to collaboratively produce validated, structured software project specifications -- including architecture decisions, task decomposition, repository blueprints, developer tickets, and code-generation prompts -- without generating any application code.

### 13.4 Feature Prioritization (Tier 1 -- MVP)

1. Debate engine with ADR output
2. 6 artifact types (task graph, repo blueprint, MPD, tickets, ai prompt pack, manifest)
3. Provider-agnostic architecture (OpenRouter primary, extensible)
4. Quality gates with auto-fix
5. CLI UX (Oclif with ora/ink)

> Source: Competitive positioning (Section 13).

---

## 14. Known Limitations & Future Work

### 14.1 AI SDK v6 Migration (Deferred)

ATSF is pinned to AI SDK v5 because the OpenRouter provider (`@openrouter/ai-sdk-provider@2.2.3`) does not yet support v6's `LanguageModelV3` specification. Migration is tracked in [OpenRouterTeam/ai-sdk-provider#307](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/307).

**When to migrate:** Once the OpenRouter provider ships v6 support (expected as `@openrouter/ai-sdk-provider@3.x`).

**Migration path:**
1. Run `npx @ai-sdk/codemod v6`
2. Replace `generateObject()` with `generateText()` + `Output.object()`
3. Replace `maxSteps` with `stopWhen(stepCountIs(n))`
4. Replace `CoreMessage` with `ModelMessage`
5. Replace `system` with `instructions`
6. Update test mocks from V2 to V3

> Source: ai-sdk-v6 correction document, Section 8.

### 14.2 Error Recovery & State Persistence (Not Implemented)

Crash recovery and checkpoint/resume capability are not yet addressed. For long-running multi-agent orchestrations, this is critical.

**What is needed:**
- Checkpoint/resume after crash mid-execution
- Idempotent re-execution (skip completed tasks)
- State persistence to disk (TaskGraph execution state)
- ~~Graceful shutdown on SIGINT/SIGTERM~~ (specified in Section 15.6.1)

This was identified as synthesis report missing coverage M1 and re-research topic R9.

### 14.3 User Interaction Model

**Resolved.** See Section 3.5 for the full specification.

### 14.4 Testing Strategy

This section defines the complete testing strategy for ATSF, covering test structure, mock patterns for LLM calls, CLI testing with Oclif, contract schema testing, and coverage targets. ATSF uses **Vitest v3.x** as the test runner (Section 11) with `@oclif/test` v4 for CLI command testing (Section 3.7).

#### 14.4.1 Test Directory Structure

```
tests/
  unit/
    dag/
      graph-builder.test.ts       # TaskGraph construction from YAML
      validator.test.ts           # DFS cycle detection
      conflict-detector.test.ts   # micromatch file conflict analysis
      topological-sort.test.ts    # Kahn's algorithm
    debate/
      engine.test.ts              # 3-round debate orchestration
      judge.test.ts               # Judge synthesis logic
      convergence.test.ts         # Convergence detection thresholds
      adr-generator.test.ts       # MADR v4 output format
    gates/
      coverage.test.ts            # Coverage gate bipartite graph
      consistency.test.ts         # Cross-reference integrity
      testability.test.ts         # Vague pattern regex
      buildability.test.ts        # DAG validation gate
      security.test.ts            # Secret/injection detection
      registry.test.ts            # Gate plugin registry
      fix-engine.test.ts          # Declarative fix application
      orchestrator.test.ts        # Parallel gate execution
    contracts/
      schemas.test.ts             # 9-field agent output schema
      envelope.test.ts            # Versioned envelope validation
      validator.test.ts           # L1/L2/L3 validation pipeline
      artifact-schemas.test.ts    # All 7 artifact schemas (10.7)
    emitter/
      pipeline.test.ts            # Sequential emitter pipeline
      virtual-fs.test.ts          # In-memory FS + atomic flush
      task-graph.test.ts          # task_graph.yaml emitter
      repo-blueprint.test.ts      # repo_blueprint.yaml emitter
      mpd.test.ts                 # MPD.md emitter
      tickets.test.ts             # tickets/ emitter
      prompt-pack.test.ts         # ai_prompt_pack/ emitter
      manifest.test.ts            # manifest.json emitter
    providers/
      registry.test.ts            # ProviderRegistry
      openrouter.test.ts          # OpenRouter adapter (mocked)
      claude-code.test.ts         # Claude Code CLI adapter (mocked)
    resilience/
      rate-limiter.test.ts        # Token bucket
      circuit-breaker.test.ts     # Circuit breaker state machine
      cost-tracker.test.ts        # Budget enforcement
    config/
      loader.test.ts              # cosmiconfig loading + Zod validation
      schema.test.ts              # Config schema defaults and overrides
  integration/
    pipeline.test.ts              # init -> plan -> build -> gate -> emit
    debate-flow.test.ts           # Full debate with mock agents
    gate-pipeline.test.ts         # All 5 gates on sample artifacts
    emitter-pipeline.test.ts      # Emitter pipeline with real templates
    cross-ref-validation.test.ts  # L3 cross-reference validation
  commands/
    init.test.ts                  # atsf init (creates config)
    plan.test.ts                  # atsf plan (task graph generation)
    debate.test.ts                # atsf debate (debate orchestration)
    build.test.ts                 # atsf build (DAG execution)
    gate.test.ts                  # atsf gate (quality check)
    emit.test.ts                  # atsf emit (artifact generation)
    serve.test.ts                 # atsf serve (feedback server)
    query.test.ts                 # atsf query (artifact query)
    review.test.ts                # atsf review (escalation review)
  fixtures/
    sample-task-graph.yaml        # Valid 12-task TaskFlow example
    invalid-task-graph.yaml       # Cyclic dependency, missing refs
    sample-repo-blueprint.yaml    # Valid repo blueprint
    sample-tickets/               # 3 sample tickets (YAML frontmatter + MD)
    sample-prompts/               # 3 sample AI prompt packs
    sample-mpd.json               # Valid MPD structured data
    sample-adr.json               # Valid ADR (MADR v4)
    mock-llm-responses/           # Pre-recorded LLM responses (JSON)
      plan-response.json
      debate-round-1.json
      debate-round-2.json
      debate-round-3.json
      judge-synthesis.json
      build-response.json
    sample-config/
      valid-config.yaml           # Complete .atsfrc.yaml
      minimal-config.yaml         # Minimal required config
      invalid-config.yaml         # Schema violation examples
  helpers/
    fixtures.ts                   # Fixture loading utilities
    mock-provider.ts              # Shared mock provider setup
    test-config.ts                # Test configuration helpers
```

#### 14.4.2 Mock Patterns for LLM Calls

ATSF's provider system wraps the AI SDK's `generateObject()` function (Section 4). Tests must mock LLM calls without hitting real APIs to ensure determinism, speed, and zero cost.

**Pattern 1: AI SDK MockLanguageModelV2 (preferred for unit tests)**

The AI SDK provides `MockLanguageModelV2` in the `ai/test` module for deterministic testing:

```typescript
// Reference implementation
import { generateObject } from 'ai';
import { MockLanguageModelV2, mockValues } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { AgentOutputSchema } from '../../src/contracts/schemas.js';

describe('agent output generation', () => {
  it('generates valid structured output', async () => {
    const mockModel = new MockLanguageModelV2({
      defaultObjectGenerationMode: 'json',
      doGenerate: mockValues([
        {
          rawResponse: { headers: {} },
          finishReason: 'stop',
          usage: { promptTokens: 100, completionTokens: 200 },
          text: JSON.stringify({
            assumptions: [{ id: 'ASMP-001', description: 'User wants REST API', source: 'inferred', confidence: 0.9, validatedBy: null }],
            findings: [],
            decisions: [],
            // ... remaining 6 fields
          }),
        },
      ]),
    });

    const result = await generateObject({
      model: mockModel,
      schema: AgentOutputSchema,
      prompt: 'Analyze the project requirements',
    });

    expect(result.object.assumptions).toHaveLength(1);
    expect(result.object.assumptions[0].id).toBe('ASMP-001');
  });
});
```

**Note:** ATSF pins to AI SDK v5 (Section 4.1, 14.1), which uses `LanguageModelV2` internally. `MockLanguageModelV2` is the correct mock class. When AI SDK v6 migration occurs (Section 14.1), update to `MockLanguageModelV3`.

**Pattern 2: Vitest `vi.mock()` for provider isolation**

When testing code that calls the provider layer rather than `generateObject` directly:

```typescript
// Illustrative — adapt to your implementation
import { vi, describe, expect, it, beforeEach } from 'vitest';

// Mock the entire provider module
vi.mock('../../src/providers/openrouter.js', () => ({
  OpenRouterProvider: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({
      object: { /* mock structured output */ },
      usage: { promptTokens: 100, completionTokens: 200 },
      finishReason: 'stop',
    }),
    id: 'openrouter',
    name: 'OpenRouter',
  })),
}));
```

**Pattern 3: Fixture-based testing for complex scenarios**

For integration tests that exercise multi-step pipelines, use pre-recorded LLM responses from the `fixtures/mock-llm-responses/` directory:

```typescript
// Illustrative — adapt to your implementation
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function loadMockResponse(name: string): Promise<unknown> {
  const path = join(import.meta.dirname, '../fixtures/mock-llm-responses', `${name}.json`);
  return JSON.parse(await readFile(path, 'utf-8'));
}

// In test setup:
const debateRound1 = await loadMockResponse('debate-round-1');
mockProvider.generate.mockResolvedValueOnce(debateRound1);
```

**Pattern 4: Snapshot testing for emitter output determinism**

Emitter output (YAML, Markdown, JSON) must be deterministic given the same input. Use Vitest's snapshot testing:

```typescript
// Illustrative — adapt to your implementation
import { describe, expect, it } from 'vitest';

describe('task graph emitter', () => {
  it('produces deterministic YAML output', async () => {
    const taskGraph = await loadFixture('sample-task-graph.yaml');
    const output = await emitTaskGraph(taskGraph);
    expect(output).toMatchSnapshot();
  });
});
```

Snapshot files are committed to source control. When emitter output format changes intentionally, snapshots are updated with `vitest --update`.

#### 14.4.3 Oclif CLI Command Testing

All 9 CLI commands are tested using `@oclif/test` v4's `runCommand()` function (Section 3.7). The `disableConsoleIntercept: true` Vitest config option is required.

```typescript
// Reference implementation
import { runCommand } from '@oclif/test';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('atsf init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates default config file', async () => {
    const { stdout, error } = await runCommand(
      ['init', '--dir', tempDir, '--force'],
      { root: import.meta.dirname },
    );
    expect(error).toBeUndefined();
    expect(stdout).toContain('Initialized ATSF project');
  });

  it('fails if config already exists without --force', async () => {
    await runCommand(['init', '--dir', tempDir], { root: import.meta.dirname });
    const { error } = await runCommand(
      ['init', '--dir', tempDir],
      { root: import.meta.dirname },
    );
    expect(error?.message).toContain('already exists');
  });
});

describe('atsf gate', () => {
  it('runs all gates and reports results', async () => {
    const { stdout, error } = await runCommand(
      ['gate', '--dir', fixtureDir, '--reporter', 'json'],
      { root: import.meta.dirname },
    );
    expect(error).toBeUndefined();
    const report = JSON.parse(stdout);
    expect(report.gates).toHaveLength(5);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });

  it('returns non-zero exit on gate failure', async () => {
    const { error } = await runCommand(
      ['gate', '--dir', failingFixtureDir, '--threshold', '1.0'],
      { root: import.meta.dirname },
    );
    expect(error?.oclif?.exit).toBe(1);
  });
});
```

**Stderr/stdout capture:** `runCommand()` captures both streams. Progress/log output goes to stderr; structured results go to stdout. Tests assert on the correct stream.

**Config file injection:** Tests use `--dir` to point at a temp directory with pre-seeded config and fixture files, avoiding pollution of the real filesystem.

#### 14.4.4 Contract Schema Testing

Every Zod schema defined in Section 10.7 must have both positive (parse) and negative (reject) test cases. This ensures the schemas serve as enforceable contracts.

```typescript
// Reference implementation
import { describe, expect, it } from 'vitest';
import { TaskGraphSchema } from '../../src/contracts/artifact-schemas.js';

describe('TaskGraphSchema', () => {
  it('parses a valid task graph', () => {
    const valid = loadFixture('sample-task-graph.yaml');
    const result = TaskGraphSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects task graph with cyclic dependency', () => {
    const cyclic = loadFixture('invalid-task-graph.yaml');
    const result = TaskGraphSchema.safeParse(cyclic);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('Cycle detected') }),
    );
  });

  it('rejects task graph with non-existent dependency reference', () => {
    const broken = {
      ...loadFixture('sample-task-graph.yaml'),
      tasks: [{ id: 'TASK-001', dependsOn: ['TASK-999'], /* ... */ }],
    };
    const result = TaskGraphSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it('rejects task graph with duplicate task IDs', () => {
    const duped = {
      ...loadFixture('sample-task-graph.yaml'),
      tasks: [
        { id: 'TASK-001', /* ... */ },
        { id: 'TASK-001', /* ... */ },
      ],
    };
    const result = TaskGraphSchema.safeParse(duped);
    expect(result.success).toBe(false);
  });
});
```

The same parse/reject pattern applies to all 7 schemas: `TaskGraphSchema`, `RepoBlueprintSchema`, `MpdSchema`, `TicketSchema`, `AiPromptPackSchema`, `AdrSchema`, and `ManifestSchema`.

#### 14.4.5 Coverage Targets

| Category | Metric | Target | Rationale |
|----------|--------|--------|-----------|
| **Unit tests** | Line coverage | 80%+ | Core business logic in `dag/`, `debate/`, `gates/`, `contracts/`, `emitter/` |
| **CLI commands** | Happy-path coverage | 9/9 commands | Every CLI command has at least 1 successful execution test |
| **Contract schemas** | Parse/reject coverage | 100% of schemas | All 7 artifact schemas in 10.7 have both valid-parse and invalid-reject tests |
| **Integration tests** | Pipeline coverage | 4 flows | `init->emit`, debate flow, gate pipeline, cross-ref validation |
| **Gate plugins** | Per-gate coverage | 5/5 gates | Each gate has unit tests for its core detection logic |
| **Providers** | Mock coverage | 2/2 providers | OpenRouter and Claude Code adapters tested with mocked I/O |
| **Resilience** | State machine coverage | 100% of states | Circuit breaker (closed/half-open/open), rate limiter (allow/deny) |

**Vitest configuration for coverage:**

```typescript
// Reference implementation
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/commands/**',  // Covered by integration tests
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 30_000,         // 30s for integration tests
    hookTimeout: 10_000,
  },
});
```

**CI integration:** Tests run in GitHub Actions on every push and PR. The gate threshold is enforced in CI: `vitest run --coverage` must pass the configured thresholds or the pipeline fails.

> Source: Synthesis report M3. AI SDK testing docs; @oclif/test v4 migration guide; Vitest coverage configuration.

### 14.5 Security Model

**Resolved.** See Section 7.3.5 for the full specification.

### 14.6 Versioning and Release Strategy (Not Defined)

How ATSF itself will be versioned, released, or distributed is not yet defined:
- npm package publishing strategy
- Global install vs npx vs local install
- Semantic versioning policy
- Changelog generation

> Source: Synthesis report M5.

### 14.7 Performance Benchmarks (Not Established)

Performance benchmarks are not yet established for:
- Maximum task graph size before performance degrades
- Maximum concurrent LLM calls
- Memory footprint for large projects
- Token budget for a typical project

These are needed to validate the pricing model assumptions in the competitive analysis (Section 13).

> Source: Synthesis report M6.

### 14.8 Offline / Local Model Support (Deferred)

The provider system (Section 4) covers OpenRouter and Claude Code CLI but does not address local model support (Ollama, llama.cpp). The competitive analysis (Section 13) shows competitors support local models.

**Future work:** Add a `LocalModelProvider` implementing the `ProviderAdapter` interface, using Ollama's OpenAI-compatible API endpoint.

> Source: Synthesis report M7.

### 14.9 Configuration Schema

**Resolved.** See Section 3.4 for the full specification.

### 14.10 Migration Paths from Competitors (Not Designed)

The competitive analysis (Section 13) identifies competitors, but no import/migration paths are designed for users coming from MetaGPT, CrewAI, or other tools.

> Source: Synthesis report M9.

### 14.11 Observability and Debugging

**Resolved.** See Section 3.6 for the full specification.

### 14.12 Integration Gap: Emitter Pipeline <-> Task Graph (Partially Resolved)

The emitter pipeline (Section 10) consumes task graph data, but there is no explicit typed interface for the handoff. The `TaskGraph` interface in Section 5.3 serves as the contract, but the emitter-specific data requirements (e.g., metadata for ticket generation) need a dedicated adapter type.

> Source: Synthesis report G1.

### 14.13 Integration Gap: Contract Versioning <-> Emitter Determinism

If a contract version changes, emitter content hashes change. There is no versioning strategy for emitter output that tracks which contract versions were used to produce a given set of artifacts.

**Proposed solution (future):** Include contract version in the manifest:

```json
{
  "generated": "2026-02-25T12:00:00Z",
  "contractVersion": "1.0",
  "files": {
    "task_graph.yaml": { "checksum": "sha256:...", "contractVersion": "1.0" }
  }
}
```

> Source: Synthesis report G6.

### 14.14 dependency-graph Package Maintenance

The `dependency-graph` npm package (v1.0.0) has not been updated in ~2 years. It is feature-complete for ATSF's needs, but the team should be prepared to:
- Fork the package if security vulnerabilities are discovered
- Inline the ~200 LOC of relevant logic as a last resort

> Source: Synthesis report V7.

---

## 15. Feedback Loop

ATSF produces 5 structured artifacts that downstream AI coder orchestration systems consume. But consumption is currently one-way: ATSF emits, coders read. The **feedback loop** closes this gap by allowing AI coders to query ATSF artifacts during implementation, report issues when they hit blockers, and validate their work against ATSF's contracts.

### 15.1 Overview

The feedback loop is delivered as three interfaces:

| Interface | Command | Purpose |
|-----------|---------|---------|
| **HTTP API** | `atsf serve` | Local Fastify-based HTTP server for programmatic access |
| **CLI** | `atsf query` | Command-line Q&A against ATSF artifacts |
| **MCP Server** | `atsf serve --mcp` | Model Context Protocol tools for direct AI tool integration |

### 15.2 Architecture

```
                AI Coder (Cursor/Claude Code/Aider/Custom Agent)
                           |              |
                    HTTP REST API    MCP Protocol (stdio)
                           |              |
                    ┌──────▼──────────────▼──────────┐
                    │          atsf serve              │
                    │  ┌─────────────────────────────┐ │
                    │  │   Fastify HTTP Server        │ │
                    │  │   (localhost:4567)            │ │
                    │  └──────────┬──────────────────┘ │
                    │  ┌──────────▼──────────────────┐ │
                    │  │   ArtifactIndex              │ │
                    │  │   - BM25 in-memory search    │ │
                    │  │   - Structured artifact store│ │
                    │  │   - Cross-reference resolver │ │
                    │  └──────────┬──────────────────┘ │
                    │  ┌──────────▼──────────────────┐ │
                    │  │   QueryEngine               │ │
                    │  │   - BM25 retrieval           │ │
                    │  │   - Context assembly         │ │
                    │  │   - Optional LLM synthesis   │ │
                    │  └──────────┬──────────────────┘ │
                    │  ┌──────────▼──────────────────┐ │
                    │  │   IssueLog                   │ │
                    │  │   - In-memory + JSONL on disk│ │
                    │  └─────────────────────────────┘ │
                    └──────────────────────────────────┘
                                    |
                         ATSF Output Directory
                         ./atsf-output/
```

**Why Fastify:** Fastify aligns with ATSF's existing stack (pino logging, TypeScript-first, ESM, Zod validation support) and provides built-in JSON Schema validation and plugin architecture. Express is used in generated *projects* (TaskFlow example); Fastify is used in the ATSF *tool itself*.

**Why BM25 as primary retrieval (not embeddings):** For a local CLI tool serving its own artifacts, BM25 provides zero-dependency, deterministic, sub-100ms in-memory search without external API calls. ATSF artifacts use consistent terminology, making keyword matching highly effective.

**Hybrid retrieval strategy:** While BM25 is the primary retrieval mechanism, two supplementary strategies improve recall for queries that don't use exact artifact terminology:

1. **Structured field matching:** Before BM25 scoring, the query is checked against structured fields (task IDs like `TASK-001`, file paths, agent names) using exact/prefix matching. Structured matches are boosted above BM25 results.
2. **Synonym expansion:** A small, hand-curated synonym map (e.g., "database" -> "db", "authentication" -> "auth", "configuration" -> "config") expands query terms before BM25 scoring. This is maintained in `src/feedback/synonyms.ts` (~50 entries) and requires no external dependencies.
3. **Optional LLM reranking:** When `rawContext=false` and the top BM25 score is below the `medium` confidence threshold (5.0), the LLM synthesis step implicitly reranks by selecting the most relevant chunks from the retrieved set. This provides semantic understanding without a separate embedding pipeline.

**Why NOT embeddings:** Embedding-based retrieval would require either (a) an external API call per query (adding latency and cost) or (b) a local embedding model (~100MB+ dependency). Neither is justified for ATSF's corpus size (typically <1000 chunks) where BM25 + synonym expansion achieves >90% recall on structured technical artifacts.

> Source: Design verification (bm25 agent, cross-examined by gates-res and lockman agents).

### 15.3 API Endpoints

All endpoints are served at `http://127.0.0.1:4567/api/`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/query` | Natural language Q&A about the project |
| GET | `/api/tasks` | List all tasks with filtering and pagination |
| GET | `/api/tasks/:id` | Get detailed task information |
| GET | `/api/tasks/:id/prompt` | Get AI prompt pack for a task |
| GET | `/api/tasks/:id/ticket` | Get ticket for a task |
| GET | `/api/tasks/:id/deps` | Get task dependency graph |
| GET | `/api/blueprint` | Get repository blueprint |
| GET | `/api/decisions` | List architecture decisions |
| GET | `/api/decisions/:id` | Get specific ADR details |
| GET | `/api/mpd` | Get full MPD |
| GET | `/api/mpd/:section` | Get specific MPD section |
| POST | `/api/validate` | Validate a file against expected contract |
| POST | `/api/report-issue` | Report implementation issue |
| GET | `/api/review/pending` | List pending escalated issues requiring human review |
| POST | `/api/review/:issueId` | Resolve an escalated issue with human answer |
| GET | `/api/status` | Project implementation status dashboard |
| GET | `/health` | Server health check |

### 15.4 Key Endpoint Schemas

#### POST /api/query

Natural language Q&A with BM25 retrieval and optional LLM synthesis.

```typescript
// Contract: implement exactly as specified
const QueryRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  taskId: z.string().regex(/^TASK-\d{3,}$/).optional(),
  // See ArtifactType in Section 10.6. manifest excluded: not queryable content.
  artifactTypes: z.array(z.enum([
    'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
  ])).optional(),
  rawContext: z.boolean().default(false),
  maxChunks: z.number().int().min(1).max(20).default(5),
});

const QueryResponseSchema = z.object({
  answer: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  answerable: z.boolean(),
  escalation: z.object({
    issueId: z.string(),
    category: z.enum([
      'ambiguous_spec', 'missing_detail', 'dependency_conflict',
      'infeasible_constraint', 'schema_mismatch', 'needs_human_judgment',
    ]),
    suggestedActions: z.array(z.string()),
    blockedTaskIds: z.array(z.string()),
  }).optional(),
  sources: z.array(z.object({
    file: z.string(),
    artifactType: z.string(),
    path: z.string().optional(),
  })),
  chunks: z.array(z.object({
    content: z.string(),
    score: z.number(),
    source: z.object({
      file: z.string(),
      artifactType: z.string(),
      path: z.string().optional(),
    }),
  })),
  relatedTasks: z.array(z.string()),
  llmUsed: z.boolean(),
  tokenUsage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).optional(),
}).superRefine((val, ctx) => {
  if (!val.answerable && !val.escalation) {
    ctx.addIssue({
      code: 'custom',
      path: ['escalation'],
      message: 'escalation is required when answerable is false',
    });
  }
});
```

#### POST /api/validate

Validates AI coder output against the expected contract from the prompt pack.

```typescript
// Contract: implement exactly as specified
const ValidateRequestSchema = z.object({
  taskId: z.string().regex(/^TASK-\d{3,}$/),
  filePath: z.string(),
  content: z.string(),
});

const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({
    path: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning']),
  })),
  warnings: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
  contract: z.object({
    taskId: z.string(),
    expectedFile: z.string(),
    contractSection: z.string().optional(),
  }),
});
```

#### POST /api/report-issue

AI coders report blockers and ambiguities back to the ATSF spec.

```typescript
// Contract: implement exactly as specified
const ReportIssueRequestSchema = z.object({
  taskId: z.string().regex(/^TASK-\d{3,}$/),
  severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
  category: z.enum([
    'ambiguous_spec', 'missing_detail', 'dependency_conflict',
    'infeasible_constraint', 'schema_mismatch', 'needs_human_judgment',
  ]),
  summary: z.string().min(1).max(500),
  description: z.string().max(5000),
  codeSnippet: z.string().max(2000).optional(),
  filePath: z.string().optional(),
  reporter: z.string().default('unknown'),
});

const ReportIssueResponseSchema = z.object({
  issueId: z.string(),
  hasSuggestion: z.boolean(),
  suggestion: z.string().optional(),
  relatedIssues: z.array(z.object({
    issueId: z.string(),
    taskId: z.string(),
    summary: z.string(),
    similarity: z.number().min(0).max(1),
  })),
  possibleCauses: z.array(z.object({
    taskId: z.string(),
    taskName: z.string(),
    reason: z.string(),
  })),
});
```

### 15.5 Query Engine Design

#### Indexing Strategy

The `ArtifactIndex` loads all ATSF artifacts on startup and builds an in-memory BM25 index using `wink-bm25-text-search`.

| Artifact | Chunking Strategy | Fields Indexed |
|----------|------------------|----------------|
| `task_graph.yaml` | One chunk per task | id, name, agent, filesWrite, filesRead, dependsOn |
| `repo_blueprint.yaml` | One chunk per file entry | path, purpose, generatedBy |
| `MPD.md` | One chunk per H2 section | section title + section content |
| `tickets/*.md` | One chunk per ticket | frontmatter fields + body text |
| `ai_prompt_pack/*.md` | One chunk per section | context, contract, instructions, constraints |

#### Query Flow

```
Question -> Structured field match -> Synonym expansion -> Tokenize
  -> [Task scoping] -> BM25 search -> Merge structured matches (boosted)
  -> Cross-ref enrichment
  -> [rawContext=true: return chunks] | [rawContext=false: LLM synthesis] -> Response
```

#### Confidence Scoring

| Level | Criteria |
|-------|----------|
| `high` | Top BM25 result score > 10.0 AND answer directly found in context |
| `medium` | Top BM25 result score 5.0-10.0 OR answer requires inference across chunks |
| `low` | Top BM25 result score < 5.0 OR context is tangentially related |

### 15.6 `atsf serve` Command

```typescript
// Reference implementation
import { Command, Flags } from '@oclif/core';

export default class Serve extends Command {
  static override description = 'Start the ATSF feedback server for AI coder integration';

  static override flags = {
    port: Flags.integer({
      char: 'p', description: 'Port to listen on',
      default: 4567, min: 1024, max: 65535,
    }),
    host: Flags.string({
      char: 'h', description: 'Host to bind to', default: '127.0.0.1',
    }),
    watch: Flags.boolean({
      char: 'w', description: 'Watch for artifact changes and re-index',
      default: false,
    }),
    mcp: Flags.boolean({
      description: 'Also start an MCP server on stdio', default: false,
    }),
    output: Flags.string({
      char: 'o', description: 'Path to ATSF output directory',
      default: './atsf-output',
    }),
    'no-llm': Flags.boolean({
      description: 'Disable LLM synthesis for queries', default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);
    // 1. Validate output directory contains manifest.json
    // 2. Build ArtifactIndex from output directory
    // 3. Start Fastify server with all routes
    // 4. If --watch, start chokidar watcher for artifact changes
    // 5. If --mcp, start MCP server on stdio
    // 6. Register graceful shutdown handlers (Section 15.6.1)
  }
}
```

#### 15.6.1 Graceful Shutdown

`atsf serve` MUST register handlers for `SIGINT` and `SIGTERM` that perform the following in order:

1. Call `fastify.close()` to stop accepting new connections and drain active requests (Fastify's built-in graceful close, 10s timeout)
2. Flush `IssueLog` to `.atsf-issues.jsonl` (ensure all in-memory issues are persisted)
3. Call `resilience.shutdown()` to clean up adaptive concurrency timers
4. Close chokidar watcher if `--watch` is active
5. Exit with code 0

If shutdown does not complete within 15 seconds, force exit with code 1.

### 15.7 `atsf query` Command

```typescript
// Reference implementation
import { Args, Command, Flags } from '@oclif/core';

export default class Query extends Command {
  static override description = 'Query ATSF artifacts about the project';

  static override args = {
    question: Args.string({
      description: 'Natural language question about the project',
      required: true,
    }),
  };

  static override flags = {
    task: Flags.string({
      char: 't', description: 'Scope the query to a specific task ID',
    }),
    format: Flags.string({
      char: 'f', description: 'Output format',
      default: 'text', options: ['text', 'json'],
    }),
    'no-llm': Flags.boolean({
      description: 'Return raw context without LLM synthesis', default: false,
    }),
    port: Flags.integer({
      char: 'p', description: 'Port of running atsf serve instance',
      default: 4567,
    }),
    output: Flags.string({
      char: 'o', description: 'Path to ATSF output directory',
      default: './atsf-output',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Query);
    // 1. Try to connect to running atsf serve at localhost:{port}
    // 2. If not running, build ArtifactIndex in-process (no Fastify)
    // 3. Run query and format output
  }
}
```

**Auto-start behavior:** The `query` command does NOT start a persistent server. If no server is running, it loads artifacts directly, runs the query in-process, and exits. This provides a zero-configuration experience.

### 15.8 MCP Server Bridge

When `atsf serve --mcp` is used, the server exposes its capabilities as MCP tools via stdio transport for direct integration with Claude Code, Cursor, and other MCP-aware tools.

**MCP Tools:**

| Tool | Description |
|------|-------------|
| `query_project` | Ask a natural language question about the project |
| `get_task` | Get detailed task information |
| `get_task_prompt` | Get the AI prompt pack for a task |
| `list_tasks` | List all tasks with status and dependencies |
| `get_blueprint` | Get the repository file structure |
| `get_decision` | Get a specific architecture decision record |
| `report_issue` | Report an implementation issue or blocker |
| `list_pending_reviews` | List escalated issues pending human review |
| `submit_review_answer` | Submit an answer to an escalated question |
| `get_project_status` | Get overall project implementation status |

> **Schema note:** Each MCP tool's input and output schemas mirror the corresponding HTTP endpoint schemas defined in Sections 15.4 and 15.13.5. For example, `query_project` accepts `QueryRequestSchema` fields and returns `QueryResponseSchema` output. `report_issue` accepts `ReportIssueRequestSchema` fields. `submit_review_answer` accepts `IssueResolutionSchema` fields. Implementors should derive MCP tool schemas directly from the Zod schemas of their HTTP counterparts.

**MCP Resources:**

| Resource URI | Description |
|-------------|-------------|
| `atsf://mpd` | Full MPD markdown document |
| `atsf://task-graph` | Complete task dependency graph (YAML) |

**Claude Code integration:**

```bash
# Add ATSF as an MCP server in Claude Code
claude mcp add atsf -- atsf serve --mcp
```

### 15.9 Issue Logging System

Issues reported via `/api/report-issue` are stored in two locations:

1. **In-memory:** For fast querying during the server session
2. **JSONL file:** `{outputDir}/.atsf-issues.jsonl` for persistence across restarts

> **Concurrency policy:** When `atsf serve` is running, it owns the JSONL file exclusively. The `atsf review` CLI MUST communicate with the running server via HTTP (at `localhost:{port}`) rather than writing the JSONL file directly. When no server is detected (connection refused on the configured port), `atsf review` may write the JSONL file directly using `fs.open()` with `O_APPEND` flag for POSIX atomic appends. Detection logic: attempt `GET /health` on `localhost:{port}`; if connection refused, assume no server running.

**Deduplication:** New issues are BM25-searched against existing issues. Matches above 0.7 similarity are flagged as potential duplicates in `relatedIssues`.

**Root cause analysis:** For each reported issue, the system traces upstream dependencies by walking the DAG, checking filesWrite/filesRead overlap, and returning overlapping upstream tasks as `possibleCauses`.

### 15.10 Configuration Extension

The ATSF config schema (Section 3.4) is extended with a `serve` section:

```typescript
// Contract: implement exactly as specified
serve: z.object({
  port: z.number().int().min(1024).max(65535).default(4567),
  host: z.string().default('127.0.0.1'),
  cors: z.boolean().default(true),
  llmEnabled: z.boolean().default(true),
  queryModel: z.string().optional(),
  maxChunks: z.number().int().min(1).max(50).default(10),
  issueLogFile: z.string().default('.atsf-issues.jsonl'),
  watchDebounceMs: z.number().int().min(100).default(1000),
}).default({}),
```

### 15.11 New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastify` | ^5.0.0 | HTTP server for `atsf serve` |
| `@fastify/cors` | ^11.0.0 | CORS support for local development |
| `wink-bm25-text-search` | ^3.1.0 | In-memory BM25 full-text search (latest: 3.1.2) |
| `chokidar` | ^4.0.0 | File watching for `--watch` mode |
| `@modelcontextprotocol/sdk` | ^1.0.0 | MCP server SDK (optional peer dependency) |

### 15.12 Phase Integration

The feedback loop fits into **Phase 4 (Polish & Launch)** or as a **Phase 5 extension**. The MVP pipeline (plan -> debate -> build -> gate -> emit) must work first. The feedback loop adds post-emit value.

> Source: Feedback agent (feedback-api-design.md); schema agent (cross-examination alignment); content agent (example alignment).

### 15.13 Escalation & Human-in-the-Loop

When a query to the ATSF feedback loop cannot be answered from existing artifacts, ATSF escalates the question for human review. This section defines the escalation data model, resolution flow, review endpoints, and orchestrator integration boundary.

**Design principle:** ATSF provides the data layer (schemas, storage, endpoints, events). The orchestrator decides policy (when to block tasks, how to notify humans, timeout behavior). This separation keeps ATSF minimal and orchestrator-agnostic.

#### 15.13.1 Escalation Categories

| Category | Trigger Condition | Example |
|----------|------------------|---------|
| `ambiguous_spec` | Query matches multiple conflicting spec sections | "Should the auth module use JWT or sessions?" (spec mentions both) |
| `missing_detail` | No relevant chunks found (BM25 top score < 2.0) | "What's the database migration strategy?" (not specified) |
| `dependency_conflict` | Task dependencies create circular or contradictory requirements | "TASK-012 requires X but TASK-008 forbids X" |
| `infeasible_constraint` | Spec requirements are technically impossible to satisfy together | "Must be <50ms latency AND call 3 external APIs synchronously" |
| `schema_mismatch` | Contract validation fails with no auto-fix available | "Output schema expects field `userId` but prompt says `user_id`" |
| `needs_human_judgment` | Question requires domain expertise beyond spec scope | "Should we prioritize mobile or desktop for the MVP?" |

#### 15.13.2 Escalation Detection Algorithm

Escalation is determined during query processing in the QueryEngine:

```typescript
// Contract: implement exactly as specified
interface EscalationDecision {
  readonly answerable: boolean;
  readonly category?: EscalationCategory;
  readonly reason?: string;
}

type EscalationCategory =
  | 'ambiguous_spec' | 'missing_detail' | 'dependency_conflict'
  | 'infeasible_constraint' | 'schema_mismatch' | 'needs_human_judgment';

/**
 * Escalation rules applied after BM25 retrieval and optional LLM synthesis.
 * Rules are evaluated in order; first match wins.
 */
const ESCALATION_RULES: readonly EscalationRule[] = [
  // Rule 1: No relevant context found
  { condition: (ctx) => ctx.topScore < 2.0, category: 'missing_detail' },

  // Rule 2: Conflicting chunks (contradictory content in top results)
  { condition: (ctx) => ctx.conflictDetected, category: 'ambiguous_spec' },

  // Rule 3: LLM synthesis explicitly flags uncertainty
  { condition: (ctx) => ctx.llmConfidence === 'low' && ctx.llmUsed, category: 'needs_human_judgment' },

  // Rule 4: Cross-reference conflict in task dependencies
  { condition: (ctx) => ctx.depConflict, category: 'dependency_conflict' },
];
```

**Confidence-to-answerable mapping:**

| Confidence | Top BM25 Score | LLM Used | Answerable |
|------------|---------------|----------|------------|
| `high` | > 10.0 | Yes/No | `true` |
| `medium` | 5.0 - 10.0 | Yes/No | `true` |
| `low` | 2.0 - 5.0 | Yes | `true` (with caveat in answer) |
| `low` | < 2.0 | Yes/No | `false` (escalation triggered) |
| `low` | any | Yes, flags uncertainty | `false` (escalation triggered) |

**Query-Triggered Escalation → EscalatedIssueRecord Construction:**

When `answerable === false`, the QueryEngine MUST construct an `EscalatedIssueRecord` using the following field-sourcing rules:

```typescript
// Contract: implement exactly as specified
function buildQueryEscalation(
  request: QueryRequest,
  decision: EscalationDecision,
  question: string,
): EscalatedIssueRecord {
  return {
    issueId: `ESC-${randomUUID().slice(0, 8)}`,
    taskId: request.taskId ?? 'unknown',
    severity: CATEGORY_SEVERITY_MAP[decision.category!],
    category: decision.category!,
    summary: `[${decision.category}]: ${question.slice(0, 200)}`,
    description: question,
    reporter: 'query-engine',
    createdAt: new Date().toISOString(),
    escalatedFrom: question,
    answerable: false,
    escalationCategory: decision.category,
    suggestedActions: deriveSuggestedActions(decision.category!),
    blockedTaskIds: request.taskId ? [request.taskId] : [],
    status: 'pending',
  };
}
```

**Category → Severity mapping:**

| Escalation Category | Severity | Rationale |
|---------------------|----------|-----------|
| `infeasible_constraint` | `critical` | Cannot proceed without resolution |
| `schema_mismatch` | `critical` | Contract violation blocks implementation |
| `dependency_conflict` | `major` | Blocks dependent tasks |
| `ambiguous_spec` | `major` | Risk of incorrect implementation |
| `missing_detail` | `minor` | Can be worked around with assumptions |
| `needs_human_judgment` | `minor` | Not a spec defect, just needs decision |

#### 15.13.3 IssueResolutionSchema

When a human resolves an escalated issue via `atsf review` or the HTTP API:

```typescript
// Contract: implement exactly as specified
const IssueResolutionSchema = z.object({
  issueId: z.string(),
  resolution: z.enum(['answered', 'dismissed', 'deferred']),
  answer: z.string().max(5000).optional(),
  updatedArtifacts: z.array(z.object({
    file: z.string(),
    // See ArtifactType in Section 10.6. manifest excluded: reviews update content artifacts.
    artifactType: z.enum([
      'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
    ]),
    description: z.string(),
  })).default([]),
  reviewer: z.string().default('unknown'),
  notes: z.string().max(2000).optional(),
}).superRefine((val, ctx) => {
  if (val.resolution === 'answered' && !val.answer) {
    ctx.addIssue({
      code: 'custom',
      message: 'Answer is required when resolution is "answered"',
      path: ['answer'],
    });
  }
});

type IssueResolution = z.infer<typeof IssueResolutionSchema>;
```

**Resolution types:**

| Resolution | Meaning | Effect |
|------------|---------|--------|
| `answered` | Human provided a definitive answer | Answer indexed, blocked tasks unblocked |
| `dismissed` | Issue is invalid or not applicable | Issue closed, no re-indexing |
| `deferred` | Issue deferred for later review | Issue remains in log, tasks stay blocked |

#### 15.13.4 Extended Issue Log Format

The `.atsf-issues.jsonl` file is extended with escalation and resolution fields:

```typescript
// Contract: implement exactly as specified
interface EscalatedIssueRecord {
  // Existing fields from ReportIssueRequestSchema (Section 15.4)
  readonly issueId: string;
  readonly taskId: string;
  readonly severity: 'critical' | 'major' | 'minor' | 'suggestion';
  readonly category: string;
  readonly summary: string;
  readonly description: string;
  readonly reporter: string;
  readonly createdAt: string;  // ISO 8601

  // Escalation fields
  readonly escalatedFrom?: string;       // Query that triggered escalation
  readonly answerable: boolean;
  readonly escalationCategory?: EscalationCategory;
  readonly suggestedActions: readonly string[];
  readonly blockedTaskIds: readonly string[];

  // Resolution fields (populated when resolved)
  readonly status: 'pending' | 'answered' | 'dismissed' | 'deferred';
  readonly resolution?: IssueResolution;
  readonly resolvedAt?: string;  // ISO 8601
}
```

#### 15.13.5 Review API Endpoints

##### GET /api/review/pending

Returns escalated issues awaiting human review.

```typescript
// Contract: implement exactly as specified
const ReviewPendingRequestSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'suggestion']).optional(),
  category: z.enum([
    'ambiguous_spec', 'missing_detail', 'dependency_conflict',
    'infeasible_constraint', 'schema_mismatch', 'needs_human_judgment',
  ]).optional(),
  taskId: z.string().regex(/^TASK-\d{3,}$/).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const ReviewPendingResponseSchema = z.object({
  issues: z.array(z.object({
    issueId: z.string(),
    taskId: z.string(),
    severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
    category: z.string(),
    summary: z.string(),
    escalatedFrom: z.string().optional(),
    suggestedActions: z.array(z.string()),
    blockedTaskIds: z.array(z.string()),
    createdAt: z.string(),
  })),
  total: z.number().int(),
  hasMore: z.boolean(),
});
```

##### POST /api/review/:issueId

Resolves an escalated issue. Request body follows `IssueResolutionSchema`.

```typescript
// Contract: implement exactly as specified
const ReviewResolveResponseSchema = z.object({
  issueId: z.string(),
  resolution: z.enum(['answered', 'dismissed', 'deferred']),
  unblockedTaskIds: z.array(z.string()),
  reindexed: z.boolean(),
});
```

#### 15.13.6 Re-indexing Flow

When an escalated issue is resolved with `resolution: 'answered'`, the answer is incorporated into the ArtifactIndex:

1. **Answer stored** in `.atsf-issues.jsonl` with resolution metadata.
2. **BM25 index updated:** The answer text is added as a new chunk with `artifactType: 'human_resolution'` and boosted relevance (score multiplier 1.5x) so future queries on the same topic find the answer.
3. **EventBus notification:** `escalation.resolved` event emitted, carrying `issueId`, `taskId`, and `resolution` type.
4. **Blocked tasks notified:** The orchestrator (if subscribed) receives the event and can unblock waiting tasks.

```
Human answer via atsf review answer / POST /api/review/:issueId
  -> IssueLog.resolve(issueId, resolution)
  -> ArtifactIndex.addChunk({ content: answer, type: 'human_resolution', ... })
  -> EventBus.emit({ type: 'escalation.resolved', issueId, taskId, resolution })
  -> [Orchestrator subscribes and unblocks tasks]
```

#### 15.13.7 Orchestrator Integration Guide

ATSF provides the escalation **data layer**. The orchestrator (external to ATSF) implements the **policy layer**. This table defines the responsibility boundary:

| Concern | ATSF Provides | Orchestrator Implements |
|---------|--------------|------------------------|
| Detection | `answerable: false` in QueryResponse | Decision to block task or continue |
| Storage | `.atsf-issues.jsonl` + in-memory log | Task state management (blocked/unblocked) |
| Notification | `escalation.created` event via EventBus | Human notification (email, Slack, CLI alert) |
| Resolution | `POST /api/review/:issueId` endpoint | UI/workflow for presenting issues to humans |
| Re-indexing | Updated BM25 index with answer | Re-querying after resolution |
| Task blocking | `task.blocked_on_human` event | DAG scheduler pause/resume for blocked tasks |
| Timeout | None (ATSF does not enforce timeouts) | Escalation timeout policy, auto-defer |
| Priority | Severity field on issues | Priority queue, SLA enforcement |

**Orchestrator integration pattern:**

```
Orchestrator calls POST /api/query
  -> ATSF returns { answerable: false, escalation: { ... } }
  -> Orchestrator marks task as blocked
  -> Orchestrator notifies human (implementation-specific)
  -> Human runs `atsf review answer <issueId> --message "..."` or uses custom UI
  -> ATSF emits escalation.resolved event
  -> Orchestrator receives event, unblocks task, retries query
```

#### 15.13.8 Sequence Diagram

```
Orchestrator           ATSF Serve            IssueLog          ArtifactIndex       Human
    |                     |                     |                    |               |
    |  POST /api/query    |                     |                    |               |
    |-------------------->|                     |                    |               |
    |                     |  BM25 search        |                    |               |
    |                     |------------------->-|                    |               |
    |                     |  top score < 2.0    |                    |               |
    |                     |<--------------------|                    |               |
    |                     |                     |                    |               |
    |                     |  Create escalation  |                    |               |
    |                     |-------------------->|                    |               |
    |                     |  issueId            |                    |               |
    |                     |<--------------------|                    |               |
    |                     |                     |                    |               |
    |                     |  emit escalation.created                 |               |
    |                     |--[EventBus]-------->|                    |               |
    |                     |                     |                    |               |
    |  { answerable: false, escalation: {...} } |                    |               |
    |<--------------------|                     |                    |               |
    |                     |                     |                    |               |
    |  [block task, notify human]               |                    |               |
    |                     |                     |                    |               |
    |                     |                     |                    | atsf review answer |
    |                     |  POST /api/review/:id                   |<--------------|
    |                     |<---------------------------------------------------------|
    |                     |                     |                    |               |
    |                     |  resolve(id, answer)|                    |               |
    |                     |-------------------->|                    |               |
    |                     |                     |  addChunk(answer)  |               |
    |                     |                     |------------------->|               |
    |                     |                     |                    |               |
    |                     |  emit escalation.resolved                |               |
    |                     |--[EventBus]-------->|                    |               |
    |                     |                     |                    |               |
    |  [receive event, unblock task]            |                    |               |
    |<--[EventBus]--------|                     |                    |               |
    |                     |                     |                    |               |
    |  POST /api/query (retry)                  |                    |               |
    |-------------------->|                     |                    |               |
    |                     |  BM25 search (now includes answer)       |               |
    |                     |------------------->-|                    |               |
    |  { answerable: true, answer: "..." }      |                    |               |
    |<--------------------|                     |                    |               |
```

> Source: Escalation design (schema-agent, cmd-agent, flow-agent; synthesized by judge-agent).

---

## Appendix A: Correction Traceability Matrix

Every correction applied in this specification is traced to its source:

| Section | Original Claim | Corrected To | Source Document |
|---------|---------------|--------------|-----------------|
| 3.1 | Commander.js recommended | Oclif (89.85 vs 71.80 weighted) | `corrections/cli-framework.md` |
| 4.1 | `generateObject()` (AI SDK) | Pin to AI SDK v5; `generateObject()` deprecated in v6 | `corrections/ai-sdk-v6.md` |
| 4.3 | N/A | `@ai-sdk/openai-compatible` as v6 workaround | `corrections/ai-sdk-v6.md` |
| 5.1 | Separate static + runtime DAG modules | Unified DAG module (static + runtime layers) | `corrections/dag-events-resilience.md` |
| 2.4 | EventBus (initial design, no execution events) | 22 event types including execution, resilience, debate, and escalation | `corrections/dag-events-resilience.md` |
| 6.3 | MADR v3.0 | MADR v4.0.0 (decision-makers, Confirmation subsection) | `corrections/eta-madr-update.md` |
| 8.1 | Zod (unspecified version) | Zod v4.3.6 | `corrections/zod-v4-migration.md` |
| 8.3 | `.superRefine()` with `ctx.path` | `ctx.path` removed in v4; use explicit path in `addIssue()` | `corrections/zod-v4-migration.md` |
| 8.5 | `z.discriminatedUnion("key", [...])` | Single-argument form: `z.discriminatedUnion([...])` | `corrections/zod-v4-migration.md` |
| 8.6 | `{ message: "..." }` in Zod | `{ error: "..." }` in Zod v4 | `corrections/zod-v4-migration.md` |
| 9.2 | p-queue v8+ | p-queue v9.1.0 | `synthesis-report.md` V3 |
| 9.4 | Separate rate limiter + circuit breaker implementations | Unified resilience layer | `corrections/dag-events-resilience.md` |
| 10.1 | Eta v3.x | Eta v4.5.1 (API unchanged, build system modernized) | `corrections/eta-madr-update.md` |

---

## Appendix B: Consensus Areas (High Confidence)

These decisions had strong agreement across multiple agents and require no further debate:

| ID | Decision | Supporting Sections |
|----|----------|---------------------|
| HC1 | TypeScript as implementation language | All sections (universal consensus) |
| HC2 | Zod for schema validation (v4) | Sections 3, 4, 5, 8 (CLI, Provider, DAG, Contracts) |
| HC3 | DAG-based task execution model | Sections 2, 5, 9 (Architecture, DAG, Parallel Execution) |
| HC4 | OpenRouter as primary provider | Sections 4, 13 (Provider, Competitive Positioning) |
| HC5 | Contract-first / schema-driven development | Sections 2, 8 (Architecture, Contracts) |
| HC6 | Debate engine as differentiator | Sections 6, 13 (Debate Engine, Competitive Positioning) |
| HC7 | YAML + Markdown as output formats | Sections 6, 10 (Debate Engine, Emitter & Artifacts) |
| HC8 | In-memory file locking (single-process) | Sections 5, 9 (DAG, Parallel Execution) |
| HC9 | Vitest for testing | Section 14.4 (Testing); Eta v4 ecosystem |
| HC10 | "AI Specification Engine" as product category | Section 13 (Competitive Positioning) |

> Source: Synthesis report Section 5.

---

## Appendix C: Module Dependency Graph

```
OrchestratorEngine (src/orchestrator/)
  |
  |-- creates --> EventBus (src/events/)
  |-- creates --> ResilienceLayer (src/resilience/)
  |-- calls  --> GraphBuilder.build() (src/dag/static/)
  |               |
  |               |-- uses --> Validator (DFS cycle detection)
  |               |-- uses --> ConflictDetector (micromatch)
  |               |-- uses --> topologicalSort (Kahn's algorithm)
  |               |-- returns --> TaskGraph (immutable)
  |
  |-- creates --> DAGScheduler (src/dag/runtime/)
  |               |-- injected: EventBus
  |               |-- injected: ResilienceLayer
  |               |-- injected: FileLockManager
  |               |-- consumes: TaskGraph.layers
  |               |-- emits: ATSFEvent (via EventBus)
  |               |-- calls: ResilienceLayer.execute() (for provider calls)
  |
  |-- calls  --> DebateEngine (src/debate/)
  |               |-- produces: Decision + ADR
  |
  |-- calls  --> GateOrchestrator (src/gates/)
  |               |-- runs: 5 parallel gates
  |               |-- produces: GateReport
  |
  |-- calls  --> EmitterPipeline (src/emitter/)
  |               |-- uses: VirtualFS
  |               |-- uses: Eta templates
  |               |-- produces: 6 artifact types (including manifest)
  |
  |-- subscribes to --> ATSFEvent (for UI, telemetry, cost display)
```

> Source: dag-events-resilience correction Section 4.5.

---

## Appendix D: File Conflict Resolution Design

To ensure the static and runtime layers always agree on which tasks conflict (synthesis report contradiction C3 resolution):

1. **Static layer** computes file conflicts once via `ConflictDetector.detect()`. This performs the expensive glob expansion using micromatch and stores results in `TaskGraph.fileConflicts`.

2. **Runtime layer** reads `TaskGraph.fileConflicts` to know which tasks conflict. The `FileLockManager` enforces mutual exclusion at runtime using this pre-computed data. It never re-analyzes file conflicts.

3. **Agreement guarantee:** The runtime layer trusts the static layer's analysis. Since both use the same `FileConflict` data structure, they cannot disagree.

```
Static (build time):
  micromatch expands globs
  -> builds conflict matrix
  -> stores as FileConflict[] in TaskGraph

Runtime (execution time):
  reads TaskGraph.fileConflicts
  -> FileLockManager enforces locks
  -> bulk acquire prevents deadlocks
```

> Source: dag-events-resilience correction Section 4.6.

---

*End of ATSF Technical Specification v1.0*
