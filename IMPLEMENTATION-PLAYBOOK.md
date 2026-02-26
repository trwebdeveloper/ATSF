# ATSF Implementation Playbook

**Purpose:** Step-by-step implementation guide for AI agents. Each task specifies exactly which spec sections to read, which files to create, what tests to write, and what the acceptance criteria are.

**Rules for AI agents:**
1. **Read ONLY the sections listed for your task.** Do not read the full 6,618-line spec.
2. **Write tests BEFORE implementation** (TDD). Every task includes test file paths.
3. **Run `pnpm vitest run` after each task** to verify nothing is broken.
4. **Do not skip tasks or reorder them.** Dependencies are strict.
5. **Each task is self-contained.** If you finish a task, stop. The next task will be assigned separately.

**Spec location:** `/home/atsf/ATSF-SPECIFICATION.md`

---

## Dependency Graph (Read-Only Reference)

```
T01 (Scaffolding)
 └─► T02 (Shared Types + EventBus)
      ├─► T03 (Config System)
      │    └─► T04 (Provider Adapters)
      │         └─► T05 (Resilience Layer)
      │              ├─► T07 (DAG Runtime Layer) ◄── also needs T06
      │              │    └─► T14 (Orchestrator Pipeline)
      │              ├─► T08 (Debate Engine)
      │              │    └─► T14
      │              └─► T12 (Quality Gates) ◄── also needs T10, T11, T13
      │                   └─► T14
      ├─► T06 (DAG Static Layer) ◄── depends on T02 only (no resilience needed)
      │    └─► T07
      ├─► T09 (Contract Schemas - Zod)
      │    └─► T10 (Artifact Schemas)
      │         ├─► T11 (Emitter Pipeline)
      │         │    └─► T12
      │         └─► T13 (Cross-Reference Validator) ◄── depends on T10
      │              └─► T12

T14 (Orchestrator Pipeline)
 └─► T15 (CLI Commands)
      └─► T16 (Serve & Query)
           └─► T17 (Escalation & Review)

T18 (Integration Tests) -- after T15+
T19 (CLI UI Polish) -- after T15+
```

---

## T01: Project Scaffolding

**Goal:** Create the project skeleton with all tooling configured.

**Dependencies:** None (first task)

**Spec sections to read:**
- Section 2.2 Module Structure: lines 105-228 (complete file tree)
- Section 3.1 Framework Oclif: lines 700-725
- Section 3.2 Package Configuration: lines 726-754
- Section 3.7 Testing with Vitest: lines 1138-1172
- Section 11.1-11.3 Dependencies & Versions: lines 5107-5158
- Section 14.4.1 Test Directory Structure: lines 5304-5392
- Section 14.4.5 Coverage Targets (vitest.config.ts): lines 5621-5661

**Files to create:**
```
package.json              # pnpm, "type": "module", oclif config, scripts
tsconfig.json             # strict, ESM, Node20+, paths
vitest.config.ts          # from Section 14.4.5 reference impl
pnpm-workspace.yaml       # if monorepo structure needed
.eslintrc.cjs             # basic TypeScript ESLint
src/                      # all directories from Section 2.2 (empty index.ts stubs)
tests/                    # all directories from Section 14.4.1 (empty)
tests/helpers/fixtures.ts
tests/helpers/mock-provider.ts
tests/helpers/test-config.ts
```

**Acceptance criteria:**
- [ ] `pnpm install` completes without errors
- [ ] `pnpm tsc --noEmit` passes (no type errors on empty stubs)
- [ ] `pnpm vitest run` passes (0 tests, 0 failures)
- [ ] All directories from Section 2.2 exist under `src/`
- [ ] All test directories from Section 14.4.1 exist under `tests/`
- [ ] `package.json` has `"type": "module"` and all runtime deps from Section 11.1
- [ ] Node.js >= 20.0.0 specified in `engines`

**DO NOT read:** Sections 4-15 (not needed for scaffolding)

---

## T02: Shared Types, Error Hierarchy & EventBus

**Goal:** Define all shared types, the error class hierarchy, and the full EventBus with 22 event types.

**Dependencies:** T01

**Spec sections to read:**
- Section 2.3.1 ProviderAdapter (interfaces only, not implementation): lines 232-317
- Section 2.3.2 AgentDefinition: lines 318-354
- Section 2.3.3 OrchestratorEngine (interfaces only): lines 355-417
- Section 2.4 EventBus with 22 Event Types: lines 419-670
- Section 2.5 Command-Driven Core + Event Overlay: lines 671-698

**Files to create:**
```
src/shared/types.ts          # TaskId, branded types, utility types
src/shared/errors.ts         # ATSFError base, BudgetExceededError, etc.
src/providers/types.ts       # GenerateRequest, GenerateResponse, ProviderAdapter,
                             #   TokenUsage, extractTokenUsage(), ProviderRegistry interface
src/agents/definitions.ts    # AgentDefinition interface, AgentType enum
src/events/types.ts          # ATSFEvent discriminated union (22 event types),
                             #   all event interfaces (TaskCompletedEvent, etc.)
src/events/event-bus.ts      # EventBus implementation
src/orchestrator/engine.ts   # OrchestratorEngine, Pipeline, OrchestratorConfig,
                             #   OrchestratorResult interfaces ONLY (no implementation yet)
```

**Test files:**
```
tests/unit/events/event-bus.test.ts
```

**Key tests to write:**
1. EventBus emits events to registered listeners
2. EventBus does not propagate listener errors (errors are logged, not thrown)
3. EventBus supports multiple listeners per event type
4. EventBus unsubscribe works correctly
5. All 22 event types can be emitted and received with correct payloads
6. `extractTokenUsage()` extracts `usage` field from `GenerateResponse`

**Acceptance criteria:**
- [ ] All 22 event type interfaces exported from `src/events/types.ts`
- [ ] `EventBus.emit()` accepts `ATSFEvent` discriminated union
- [ ] `EventBus.on()` narrows type by event `type` field
- [ ] Listener errors caught and do not crash emitter
- [ ] `GenerateRequest` includes `signal?: AbortSignal`
- [ ] `GenerateResponse` includes `usage: TokenUsage`
- [ ] `extractTokenUsage(response)` returns `response.usage`
- [ ] `BudgetExceededError` extends base error class
- [ ] All tests pass: `pnpm vitest run tests/unit/events/`

**DO NOT read:** Sections 4-15 (implementation details not needed)

---

## T03: Configuration System

**Goal:** Implement the config loading system using cosmiconfig + Zod validation.

**Dependencies:** T02

**Spec sections to read:**
- Section 3.4 Configuration cosmiconfig + Zod: lines 1001-1088
- Section 14.9 Configuration Schema: lines 5701-5704
- Section 7.8 Gate Configuration Schema (for `gate` config field): lines 2666-2755
- Section 15.10 Configuration Extension (for `serve` config field): lines 6153-6170

**Files to create:**
```
src/config/schema.ts     # ATSFConfigSchema (full Zod schema with all nested fields:
                         #   provider, build, debate, gate, emit, logging, serve, review)
src/config/loader.ts     # loadConfig() using cosmiconfig v9 + Zod validation
```

**Test files:**
```
tests/unit/config/schema.test.ts
tests/unit/config/loader.test.ts
tests/fixtures/sample-config/valid-config.yaml
tests/fixtures/sample-config/minimal-config.yaml
tests/fixtures/sample-config/invalid-config.yaml
```

**Key tests to write:**
1. Valid full config passes schema validation
2. Minimal config applies all defaults correctly
3. Invalid config throws ZodError with path information
4. `build.maxConcurrency` accepted and defaulted (Section 9.1.1 references this)
5. `gate` nested config with per-gate overrides works
6. `serve` config with port, host, issueLogFile defaults
7. cosmiconfig loads `.atsfrc.yaml`, `.atsfrc.json`, `atsf.config.ts`

**Acceptance criteria:**
- [ ] `ATSFConfigSchema` exported as Zod schema
- [ ] `loadConfig(overrides?)` returns validated `ATSFConfig`
- [ ] All default values match spec (build.maxConcurrency=5, debate.rounds=3, etc.)
- [ ] Config file search order: `.atsfrc.yaml` → `.atsfrc.json` → `atsf.config.ts`
- [ ] Unknown fields rejected (strict mode)
- [ ] All tests pass: `pnpm vitest run tests/unit/config/`

**DO NOT read:** Sections 4-10 (specific module implementations not needed)

---

## T04: Provider Adapters

**Goal:** Implement OpenRouter and Claude Code CLI provider adapters.

**Dependencies:** T02, T03

**Spec sections to read:**
- Section 4.1 OpenRouter via AI SDK v5: lines 1174-1196
- Section 4.2 Structured Output with generateObject(): lines 1197-1226
- Section 4.3 v6 Migration Path: lines 1227-1273
- Section 4.4 Claude Code CLI Provider: lines 1274-1373
- Section 4.5 Rate Limiting and Cost Tracking (provider-side): lines 1374-1437

**Files to create:**
```
src/providers/registry.ts      # ProviderRegistry implementation
src/providers/openrouter.ts    # OpenRouterProvider (AI SDK v5 generateObject)
src/providers/claude-code.ts   # ClaudeCodeProvider (child_process spawn)
```

**Test files:**
```
tests/unit/providers/registry.test.ts
tests/unit/providers/openrouter.test.ts
tests/unit/providers/claude-code.test.ts
tests/helpers/mock-provider.ts   # SharedmockProvider using MockLanguageModelV2
```

**Key tests to write:**
1. ProviderRegistry registers and retrieves providers by name
2. ProviderRegistry throws on duplicate registration
3. OpenRouterProvider calls `generateObject()` with correct params
4. OpenRouterProvider returns `GenerateResponse` with `usage` field populated
5. ClaudeCodeProvider spawns with `stdio: ['ignore', 'pipe', 'pipe']`
6. ClaudeCodeProvider propagates AbortSignal to kill child process
7. ClaudeCodeProvider captures stderr and throws on non-zero exit
8. ClaudeCodeProvider parses `usage.input_tokens` / `usage.output_tokens`
9. Mock provider for test helpers returns deterministic responses

**Acceptance criteria:**
- [ ] `OpenRouterProvider` implements `ProviderAdapter` interface
- [ ] `ClaudeCodeProvider` implements `ProviderAdapter` interface
- [ ] Both providers return `usage: TokenUsage` in response
- [ ] ClaudeCodeProvider uses `stdio: ['ignore', 'pipe', 'pipe']`
- [ ] AbortSignal kills child process with SIGTERM → SIGKILL fallback
- [ ] ProviderRegistry supports `get(name)`, `register(name, adapter)`, `has(name)`
- [ ] No resilience wrapping in providers (RAW calls — Section 2.3.1 contract)
- [ ] All tests pass: `pnpm vitest run tests/unit/providers/`

**DO NOT read:** Sections 5-10, 15 (unrelated modules)

---

## T05: Unified Resilience Layer

**Goal:** Implement the resilience layer: rate limiter, circuit breaker, semaphore, adaptive concurrency, cost tracking.

**Dependencies:** T02, T04

**Spec sections to read:**
- Section 9.4 Unified Resilience Layer: lines 3316-3331
- Section 9.4.1 ResilienceLayer Interface: lines 3332-3389
- Section 9.4.2 Circuit Breaker: lines 3390-3404
- Section 9.4.3 Semaphore: lines 3405-3436
- Section 9.4.4 AdaptiveConcurrencyController: lines 3437-3453
- Section 9.4.5 Cost Tracking: lines 3454-3500

**Files to create:**
```
src/resilience/types.ts               # ResilienceResult<T>, ResilienceConfig
src/resilience/rate-limiter.ts        # TokenBucketRateLimiter
src/resilience/circuit-breaker.ts     # CircuitBreaker (closed/half-open/open)
src/resilience/semaphore.ts           # Semaphore with setMaxPermits()
src/resilience/adaptive-concurrency.ts # AdaptiveConcurrencyController
src/resilience/cost-tracker.ts        # CostTracker + CostRecord + BudgetExceededError
src/resilience/resilience-layer.ts    # ResilienceLayer facade
```

**Test files:**
```
tests/unit/resilience/rate-limiter.test.ts
tests/unit/resilience/circuit-breaker.test.ts
tests/unit/resilience/semaphore.test.ts
tests/unit/resilience/cost-tracker.test.ts
```

**Key tests to write:**
1. Circuit breaker: closed → open after N failures, open → half-open after timeout, half-open → closed on success
2. Semaphore: `acquire()` blocks when no permits, `release()` unblocks waiters (FIFO)
3. Semaphore: `setMaxPermits()` increasing resolves queued waiters, decreasing drains naturally
4. Semaphore: `setMaxPermits(0)` throws
5. CostTracker: `record()` accumulates costs, `check()` throws BudgetExceededError when exceeded
6. CostRecord uses canonical TokenUsage field names (promptTokens, completionTokens, totalTokens)
7. ResilienceLayer.execute() wraps callback, records timing, records cost on success
8. ResilienceLayer.execute() retries on transient errors, does NOT retry BudgetExceededError
9. BudgetExceededError is fatal, non-retryable

**Acceptance criteria:**
- [ ] `ResilienceLayer.execute(provider, fn, signal?)` returns `ResilienceResult<T>`
- [ ] Circuit breaker state machine is correct (3 states, configurable thresholds)
- [ ] Semaphore `setMaxPermits()` contract: increase resolves FIFO, decrease drains naturally, throws if < 1
- [ ] CostTracker enforces per-run, daily, monthly budgets
- [ ] BudgetExceededError does NOT affect circuit breaker state
- [ ] Cost recording is synchronous (not event-driven)
- [ ] All tests pass: `pnpm vitest run tests/unit/resilience/`

**DO NOT read:** Sections 5-8, 10, 15 (unrelated)

---

## T06: DAG Static Layer

**Goal:** Implement graph construction, validation, conflict detection, topological sort, and critical path.

**Dependencies:** T02

**Spec sections to read:**
- Section 5.1 Unified DAG Module: lines 1439-1463
- Section 5.2.1 GraphBuilder: lines 1468-1522
- Section 5.2.2 Validator (DFS 3-Color Cycle Detection): lines 1523-1552
- Section 5.2.3 ConflictDetector (micromatch): lines 1553-1579
- Section 5.2.4 Topological Sort (Kahn's Algorithm): lines 1580-1636
- Section 5.2.5 Critical Path Computation: lines 1637-1664
- Section 5.2.6 Path Normalization: lines 1666-1680
- Section 5.3 TaskGraph (Handoff): lines 1682-1696
- Section 5.4 YAML Schema: lines 1697-1755
- Section 5.5 File Lock Detection via micromatch: lines 1756-1776
- Section 5.6 dependency-graph NPM Package: lines 1777-1788
- Appendix D File Conflict Resolution Design: lines 6592-6614

**Files to create:**
```
src/dag/types.ts                       # TaskId, TaskNode, TaskEdge, TaskGraph,
                                       #   RawTaskDefinition, TopologicalLayer, FileConflict
src/dag/static/graph-builder.ts        # GraphBuilder.build(definitions) -> TaskGraph
src/dag/static/validator.ts            # DFS 3-color cycle detection
src/dag/static/conflict-detector.ts    # micromatch glob overlap detection
src/dag/static/topological-sort.ts     # Kahn's algorithm with layer assignment
src/shared/normalize-path.ts           # normalizePath() utility
```

**Test files:**
```
tests/unit/dag/graph-builder.test.ts
tests/unit/dag/validator.test.ts
tests/unit/dag/conflict-detector.test.ts
tests/unit/dag/topological-sort.test.ts
tests/fixtures/sample-task-graph.yaml
tests/fixtures/invalid-task-graph.yaml
```

**Key tests to write:**
1. GraphBuilder constructs TaskGraph from valid RawTaskDefinition[]
2. GraphBuilder computes `layer` and `fileConflicts` for each TaskNode
3. TaskNode extends RawTaskDefinition (inherits all fields + adds layer, fileConflicts)
4. Validator detects cyclic dependencies (DFS white→gray→black)
5. Validator passes valid DAGs
6. ConflictDetector identifies overlapping globs via micromatch
7. Topological sort produces correct layers (Kahn's algorithm)
8. Critical path computes longest dependency chain
9. normalizePath converts backslash to forward slash + lowercases
10. YAML task definition parsing matches Section 5.4 schema

**Acceptance criteria:**
- [ ] `GraphBuilder.build()` takes `RawTaskDefinition[]`, returns immutable `TaskGraph`
- [ ] `TaskNode extends RawTaskDefinition` with computed `layer` and `fileConflicts`
- [ ] Cycle detection throws with cycle path on cyclic input
- [ ] ConflictDetector uses micromatch for glob overlap
- [ ] Kahn's sort assigns `layer` field to each TaskNode
- [ ] Critical path stored in `TaskGraph.criticalPath`
- [ ] All paths normalized via `normalizePath()` at input boundary
- [ ] All tests pass: `pnpm vitest run tests/unit/dag/`

**DO NOT read:** Sections 6-10, 15 (unrelated). Section 9.1-9.3 is for T07 (runtime layer).

---

## T07: DAG Runtime Layer

**Goal:** Implement DAGScheduler, TaskExecutor, FileLockManager, and execution monitoring.

**Dependencies:** T05, T06

**Spec sections to read:**
- Section 9.1 Threading Model: lines 3076-3083
- Section 9.1.1 DAGScheduler Interface: lines 3084-3133
- Section 9.1.2 TaskExecutor Interface: lines 3134-3188
- Section 9.2 Priority Queue p-queue: lines 3189-3211
- Section 9.3 In-Memory FileLockManager: lines 3212-3315 (includes deadlock prevention, FIFO, TTL)

**Files to create:**
```
src/dag/runtime/scheduler.ts          # DAGScheduler (layer-by-layer dispatch via p-queue)
src/dag/runtime/executor.ts           # TaskExecutor.dispatch(node) with resilience wrapping
src/dag/runtime/file-lock-manager.ts  # FileLockManager (bulk acquire, FIFO, TTL, stale reap)
src/dag/runtime/monitor.ts            # ExecutionSnapshot tracking
```

**Test files:**
```
tests/unit/dag/scheduler.test.ts
tests/unit/dag/executor.test.ts
tests/unit/dag/file-lock-manager.test.ts
```

**Key tests to write:**
1. DAGScheduler dispatches tasks layer by layer (respects topological order)
2. DAGScheduler uses p-queue with `concurrency` from config
3. DAGScheduler handles task failure (marks dependents as skipped)
4. TaskExecutor wraps provider calls in `ResilienceLayer.execute()`
5. TaskExecutor has `ExecutionContext` with `providerRegistry`, `resilience`, `lockManager`, `eventBus`, `agentDefinitions`, `signal`
6. FileLockManager: bulk acquire is all-or-nothing (no partial locks)
7. FileLockManager: FIFO fairness queue prevents starvation
8. FileLockManager: TTL-based stale lock expiration
9. ExecutionSnapshot tracks completed/failed/pending/running/skipped counts
10. BudgetExceededError triggers AbortController + `execution.cancelled` event

**Acceptance criteria:**
- [ ] `DAGScheduler.execute(taskGraph)` returns `ExecutionSnapshot`
- [ ] Tasks within same layer execute concurrently (up to maxConcurrency)
- [ ] FileLockManager prevents deadlocks (Coffman condition 2 eliminated)
- [ ] `toFileAccess(node)` maps TaskNode to FileAccess[]
- [ ] BudgetExceededError propagation follows 5-point policy (Section 9.4.5)
- [ ] All tests pass: `pnpm vitest run tests/unit/dag/`

**DO NOT read:** Sections 6-8, 10, 15 (unrelated)

---

## T08: Debate Engine

**Goal:** Implement the 3-round debate protocol with convergence detection and ADR generation.

**Dependencies:** T04, T05

**Spec sections to read:**
- Section 6.1 Three-Round Structure: lines 1789-1800
- Section 6.2 Judge-Agent Pattern: lines 1801-1849
- Section 6.3 MADR v4.0 Format: lines 1850-1867
- Section 6.4 MADR v4 Eta Template: lines 1868-1951
- Section 6.5 MADR v4 Data Interface: lines 1952-1995
- Section 6.6 Convergence Detection: lines 1996-2131
- Section 6.7 Storage Dual Format: lines 2132-2161
- Section 6.8 Provider Integration: lines 2162-2299

**Files to create:**
```
src/debate/engine.ts          # DebateEngine (3-round orchestration)
src/debate/judge.ts           # Judge synthesis (DebateDecisionSchema)
src/debate/convergence.ts     # ConvergenceDetector (BM25 fuzzyMatch, 0.6 threshold)
src/debate/adr-generator.ts   # MADR v4 ADR generation (Eta templates)
src/emitter/templates/adr.eta # MADR v4 Eta template from Section 6.4
```

**Test files:**
```
tests/unit/debate/engine.test.ts
tests/unit/debate/judge.test.ts
tests/unit/debate/convergence.test.ts
tests/unit/debate/adr-generator.test.ts
tests/fixtures/mock-llm-responses/debate-round-1.json
tests/fixtures/mock-llm-responses/debate-round-2.json
tests/fixtures/mock-llm-responses/debate-round-3.json
tests/fixtures/mock-llm-responses/judge-synthesis.json
```

**Key tests to write:**
1. DebateEngine runs exactly `config.rounds` rounds (default 3)
2. Round 1: each proposer generates a Proposal
3. Round 2: each proposer generates Critiques for other proposals
4. Round 3: judge synthesizes Decision from all proposals + critiques
5. `Decision.dissent` is `Array<{ agent, position, reason }>` (structured)
6. DebateConfig includes optional `model?: string`
7. Convergence detection: convergenceScore 0.0-1.0 based on BM25 fuzzyMatch
8. Non-convergence fallback: judge forced decision after maxRounds
9. ADR generated in MADR v4 format via Eta template
10. Token budget checked per round (Section 6.6.3)
11. `DebateDecisionSchema` used (not `AgentDecisionSchema` — Section 6.8.3)

**Acceptance criteria:**
- [ ] `DebateEngine.runDebate(config)` returns `{ decision, adr, rounds, convergenceHistory }`
- [ ] All LLM calls wrapped in `ResilienceLayer.execute()`
- [ ] Uses `extractTokenUsage(response)` for cost tracking
- [ ] ADR output matches MADR v4 template (Section 6.4)
- [ ] Convergence detection uses BM25 fuzzyMatch with 0.6 threshold
- [ ] DebateDecisionSchema distinct from AgentDecisionSchema
- [ ] All tests pass: `pnpm vitest run tests/unit/debate/`

**DO NOT read:** Sections 5, 7-10, 15 (unrelated)

---

## T09: Contract Schemas (Agent Output)

**Goal:** Implement the 9-field agent output schema, versioned envelope, and 3-level validation pipeline.

**Dependencies:** T02

**Spec sections to read:**
- Section 8.1 Zod v4 Schemas: lines 2761-2781
- Section 8.2 Nine-Field Agent Output Schema: lines 2782-2888
- Section 8.3 Cross-Field Validation via .superRefine(): lines 2889-2943
- Section 8.4 Three-Level Validation: lines 2944-2983
- Section 8.5 Versioned Envelope with Discriminated Union: lines 2984-3021
- Section 8.6 Additional Zod v4 Migration Notes: lines 3022-3040
- Section 8.7 Contract Lock Manager: lines 3041-3075

**Files to create:**
```
src/contracts/schemas.ts         # AgentOutputSchema (9 fields), AgentDecisionSchema,
                                 #   per-record-type schemas (SPEC-NNN, DEC-NNN, etc.)
src/contracts/envelope.ts        # VersionedEnvelope with discriminated union
src/contracts/validator.ts       # L1 (structural), L2 (semantic), L3 (cross-agent) pipeline
src/contracts/lock-manager.ts    # ContractLockManager (optional, mark as MVP-deferred)
src/contracts/dependency-graph.ts # Contract change propagation
```

**Test files:**
```
tests/unit/contracts/schemas.test.ts
tests/unit/contracts/envelope.test.ts
tests/unit/contracts/validator.test.ts
```

**Key tests to write:**
1. AgentOutputSchema validates 9 required fields
2. All record types (SPEC-NNN, DEC-NNN, etc.) parse correctly
3. superRefine: when `decision` is "rejected", `feedback` must be non-empty
4. Versioned envelope wraps agent output with version discriminator
5. L1 validation: structural (Zod parse)
6. L2 validation: semantic (cross-field superRefine)
7. L3 validation: cross-agent (stub — will be completed in T13)
8. Invalid inputs produce meaningful error paths

**Acceptance criteria:**
- [ ] `AgentOutputSchema` exported with 9 required fields
- [ ] Versioned envelope supports `v1` discriminator
- [ ] Validation pipeline runs L1 → L2 → L3 in sequence
- [ ] L1 and L2 are functional; L3 is a stub (returns pass)
- [ ] All schemas use Zod v4 APIs (z.object, z.enum, .superRefine)
- [ ] ContractLockManager exists but marked as `// MVP-deferred` per spec
- [ ] All tests pass: `pnpm vitest run tests/unit/contracts/`

**DO NOT read:** Sections 4-7, 9-10, 15 (unrelated)

---

## T10: Artifact Schemas (Output Contracts)

**Goal:** Implement all 7 Zod artifact schemas and shared primitives.

**Dependencies:** T09

**Spec sections to read:**
- Section 10.7.1 Shared Primitives: lines 3801-3875
- Section 10.7.2 TaskGraphSchema: lines 3876-3992
- Section 10.7.3 RepoBlueprintSchema: lines 3993-4043
- Section 10.7.4 MpdSchema (Structured): lines 4044-4206
- Section 10.7.5 TicketSchema: lines 4207-4246
- Section 10.7.6 AiPromptPackSchema: lines 4247-4329
- Section 10.7.7 AdrSchema (MADR v4.0): lines 4330-4377
- Section 10.7.8 ManifestSchema: lines 4378-4405
- Section 10.7.9 TypeScript Type Exports: lines 4406-4416
- Section 10.9 Realistic Output Examples: lines 4502-5105 (use as test fixtures!)

**Files to create:**
```
src/contracts/artifact-schemas.ts   # All 7 artifact schemas:
                                    #   TaskGraphSchema, RepoBlueprintSchema, MpdSchema,
                                    #   TicketSchema, AiPromptPackSchema, AdrSchema,
                                    #   ManifestSchema
                                    # Shared primitives: TaskId, ArtifactVersion, SemVer,
                                    #   RelativeFilePath, NonEmptyString, ISODatetime, etc.
```

**Test files:**
```
tests/unit/contracts/artifact-schemas.test.ts
tests/fixtures/sample-task-graph.yaml       # Based on Section 10.9.1 (12-task example)
tests/fixtures/sample-repo-blueprint.yaml
tests/fixtures/sample-tickets/
tests/fixtures/sample-prompts/
tests/fixtures/sample-mpd.json
tests/fixtures/sample-adr.json
```

**Key tests to write:**
1. Each of the 7 schemas parses its corresponding sample fixture
2. Each schema rejects invalid input (missing required fields, wrong types)
3. `ArtifactVersion` validates N.N format (e.g., "1.0")
4. `SemVer` validates N.N.N format (e.g., "1.0.0")
5. `TaskId` validates TASK-NNN+ format
6. `RelativeFilePath` rejects absolute paths and paths starting with /
7. ManifestSchema uses `SemVer` for `atsfVersion`, `ArtifactVersion` for `version`
8. TaskGraphSchema validates the 12-task example from Section 10.9.1

**Acceptance criteria:**
- [ ] All 7 schemas exported from `src/contracts/artifact-schemas.ts`
- [ ] TypeScript types exported via `z.infer<>` (Section 10.7.9)
- [ ] ArtifactVersion (N.N) distinct from SemVer (N.N.N)
- [ ] All sample fixtures from Section 10.9 validate against their schemas
- [ ] All tests pass: `pnpm vitest run tests/unit/contracts/artifact-schemas.test.ts`

**DO NOT read:** Sections 4-9, 15 (unrelated)

---

## T11: Emitter Pipeline

**Goal:** Implement the emitter pipeline with VirtualFS, Eta templates, and all 6 artifact emitters.

**Dependencies:** T10

**Spec sections to read:**
- Section 10.1 Eta v4 Template Engine: lines 3502-3544
- Section 10.2 YAML Generation yaml v2.x: lines 3545-3569
- Section 10.3 Emitter Pipeline: lines 3570-3585
- Section 10.4 VirtualFS for Atomic Flush: lines 3586-3615
- Section 10.5 Deterministic Output: lines 3616-3635
- Section 10.6 Six Artifact Types: lines 3636-3796
- Section 14.12 Integration Gap Emitter <-> Task Graph: lines 5715-5720

**Files to create:**
```
src/emitter/types.ts              # EmitterPipeline, VirtualFS interfaces
src/emitter/virtual-fs.ts         # VirtualFS: in-memory FS + atomic flush
                                  #   (sibling temp dir, EXDEV fallback)
src/emitter/pipeline.ts           # Sequential emitter pipeline
src/emitter/emitters/task-graph.ts
src/emitter/emitters/repo-blueprint.ts
src/emitter/emitters/mpd.ts
src/emitter/emitters/tickets.ts
src/emitter/emitters/prompt-pack.ts
src/emitter/emitters/manifest.ts
src/emitter/templates/            # Eta v4 templates for each artifact type
```

**Test files:**
```
tests/unit/emitter/pipeline.test.ts
tests/unit/emitter/virtual-fs.test.ts
tests/unit/emitter/task-graph.test.ts
tests/unit/emitter/repo-blueprint.test.ts
tests/unit/emitter/mpd.test.ts
tests/unit/emitter/tickets.test.ts
tests/unit/emitter/prompt-pack.test.ts
tests/unit/emitter/manifest.test.ts
```

**Key tests to write:**
1. VirtualFS: write files, read back, list all
2. VirtualFS: `flush()` creates sibling temp dir (same parent), not `/tmp`
3. VirtualFS: `flush()` falls back to copy+delete on EXDEV error
4. Pipeline runs 6 emitters in sequence: task_graph → repo_blueprint → mpd → tickets → prompt_pack → manifest
5. Each emitter produces output that validates against its artifact schema (T10)
6. Deterministic output: same input → same YAML (sorted keys, no Date())
7. Content hashes included in manifest
8. Manifest `generatedFiles` lists all emitted files

**Acceptance criteria:**
- [ ] `VirtualFS.flush()` uses sibling temp dir to avoid EXDEV
- [ ] Pipeline produces all 6 artifact types
- [ ] All output validates against artifact schemas from T10
- [ ] YAML output is deterministic (sorted keys)
- [ ] Eta v4 templates render correctly
- [ ] All tests pass: `pnpm vitest run tests/unit/emitter/`

**DO NOT read:** Sections 4-9, 15 (unrelated)

---

## T12: Quality Gates

**Goal:** Implement the 5-gate pipeline with auto-fix engine and reporting.

**Dependencies:** T05, T10, T11, T13

**Spec sections to read:**
- Section 7.1 Plugin-Based Pipeline: lines 2301-2321
- Section 7.2 Three-Layer Zod Validation: lines 2322-2335
- Section 7.3 Five Quality Gates: lines 2336-2398
- Section 7.4 Auto-Fix Engine: lines 2399-2427
- Section 7.5 Reporting: lines 2428-2453
- Section 7.6 Gate Plugin Interface: lines 2454-2532
- Section 7.6.1 Resource Contention Mitigation: lines 2533-2573
- Section 7.7 Gate Registration and Discovery: lines 2574-2665
- Section 7.8 Gate Configuration Schema: lines 2666-2759

**Files to create:**
```
src/gates/types.ts          # GatePlugin, GateContext, GateResult, GateFinding, GateFix
src/gates/orchestrator.ts   # GateOrchestrator (parallel gate execution)
src/gates/coverage.ts       # Coverage gate (bipartite graph)
src/gates/consistency.ts    # Consistency gate (cross-ref integrity)
src/gates/testability.ts    # Testability gate (vague pattern regex)
src/gates/buildability.ts   # Buildability gate (DAG validation)
src/gates/security.ts       # Security gate (secret/injection detection)
src/gates/fix-engine.ts     # Auto-fix engine (declarative, max 3 rounds)
src/gates/reporters/        # Console, JSON, Markdown, JUnit reporters
```

**Test files:**
```
tests/unit/gates/coverage.test.ts
tests/unit/gates/consistency.test.ts
tests/unit/gates/testability.test.ts
tests/unit/gates/buildability.test.ts
tests/unit/gates/security.test.ts
tests/unit/gates/registry.test.ts
tests/unit/gates/fix-engine.test.ts
tests/unit/gates/orchestrator.test.ts
```

**Key tests to write:**
1. Each of 5 gates produces GateResult with findings
2. GateOrchestrator runs all gates in parallel
3. GateContext includes `provider`, `model`, `resilience`, `llmSemaphore`, `artifacts`
4. Auto-fix engine runs max 3 rounds
5. `autoFixWithLLM` captures response, extracts `tokenUsage` and `latencyMs`
6. Gate configuration: per-gate thresholds, severity overrides
7. Reporters produce correct output format (console, JSON, markdown, JUnit)
8. Custom gate registration via `z.any()` validated by GateRegistry.register()

**Acceptance criteria:**
- [ ] All 5 gates implement `GatePlugin` interface
- [ ] GateContext has `provider: ProviderAdapter` and `model: string`
- [ ] GateOrchestrator runs gates in parallel, aggregates results
- [ ] Auto-fix engine respects max 3 rounds
- [ ] Gate LLM calls go through ResilienceLayer
- [ ] Shared Semaphore limits concurrent LLM calls across gates
- [ ] All tests pass: `pnpm vitest run tests/unit/gates/`

**DO NOT read:** Sections 4, 6, 9, 15 (unrelated)

---

## T13: Cross-Reference Validator

**Goal:** Implement the 13 cross-reference rules and the CrossReferenceValidator.

**Dependencies:** T10

**Spec sections to read:**
- Section 10.8 Cross-Reference Specification: lines 4417-4501
- Section 10.8.1 Cross-Reference Rules: lines 4421-4442
- Section 10.8.2 The 13 Cross-Reference Rules: lines 4443-4460
- Section 10.8.3 CrossReferenceValidator Interface: lines 4461-4501

**Files to create:**
```
src/emitter/cross-ref-validator.ts   # CrossReferenceValidator with 13 rules
                                     #   ArtifactSet interface (taskGraph, repoBlueprint,
                                     #   mpd, tickets, promptPacks, adrs)
```

**Test files:**
```
tests/unit/emitter/cross-ref-validator.test.ts
tests/integration/cross-ref-validation.test.ts
```

**Key tests to write:**
1. XREF-001: Every task_graph task has exactly 1 ticket
2. XREF-002: Every task_graph task has exactly 1 prompt pack
3. XREF-003: RepoBlueprint `generatedBy` references valid tasks
4. XREF-004: Ticket dependencies match task dependencies
5. XREF-005/006: PromptPack references valid task IDs
6. XREF-007: MPD taskRefs reference valid tasks
7. XREF-008: MPD ADR refs match appendices
8. XREF-009: Ticket relatedDecisions reference ArtifactSet.adrs
9. XREF-010/011: PromptPack file paths match task filesWrite/filesRead
10. XREF-012: MPD critical path tasks exist in task graph
11. XREF-013: RepoBlueprint files cover task filesWrite
12. Valid ArtifactSet passes all 13 rules
13. Each rule individually fails when violated

**Acceptance criteria:**
- [ ] `CrossReferenceValidator.validate(artifacts: ArtifactSet)` returns `CrossRefValidationResult`
- [ ] All 13 XREF rules implemented
- [ ] `ArtifactSet` includes `adrs: Adr[]` field
- [ ] Rules with severity `error` cause validation failure
- [ ] Rules with severity `warning` produce warnings but don't fail
- [ ] All tests pass: `pnpm vitest run tests/unit/emitter/cross-ref-validator.test.ts`

**DO NOT read:** Sections 4-9, 15 (unrelated)

---

## T14: Orchestrator Pipeline (Full Wiring)

**Goal:** Wire together all subsystems into the OrchestratorEngine via the Pipeline factory.

**Dependencies:** T07, T08, T12

**Spec sections to read:**
- Section 2.3.3 OrchestratorEngine: lines 355-417 (Pipeline factory)
- Appendix C Module Dependency Graph: lines 6551-6588

**Files to create:**
```
src/orchestrator/engine.ts     # OrchestratorEngine implementation
                               #   (receives Pipeline, calls subsystems in order)
src/orchestrator/pipeline.ts   # createPipeline(config) factory function
src/orchestrator/config.ts     # OrchestratorConfig resolution from ATSFConfig
```

**Test files:**
```
tests/integration/pipeline.test.ts
```

**Key tests to write:**
1. `createPipeline(config)` creates all subsystems (EventBus, Resilience, ProviderRegistry, GraphBuilder, DebateEngine, GateOrchestrator, EmitterPipeline)
2. `OrchestratorEngine.run()` executes in order: debate → build → gate → emit
3. EventBus receives events from all subsystems
4. OrchestratorResult includes success, artifacts, executionSnapshot, totalCostUsd, durationMs
5. BudgetExceededError caught at orchestrator boundary, sets success=false
6. AbortSignal propagated through entire pipeline

**Acceptance criteria:**
- [ ] `createPipeline(config)` returns `Pipeline` with all subsystems
- [ ] `OrchestratorEngine.run()` returns `OrchestratorResult`
- [ ] Full pipeline: init → plan → debate → build → gate → emit
- [ ] Events flow correctly through EventBus
- [ ] All tests pass: `pnpm vitest run tests/integration/pipeline.test.ts`

**DO NOT read:** Sections 15 (serve/query — separate task)

---

## T15: CLI Commands

**Goal:** Implement all 9 CLI commands using Oclif.

**Dependencies:** T14

**Spec sections to read:**
- Section 3.1 Framework Oclif: lines 700-725
- Section 3.3 Nine Commands: lines 755-1000
- Section 3.5 UI ora + ink: lines 1090-1111
- Section 14.4.3 Oclif CLI Command Testing: lines 5502-5570

**Files to create:**
```
src/cli/commands/init.ts      # atsf init (create config + workspace)
src/cli/commands/plan.ts      # atsf plan (task graph generation)
src/cli/commands/debate.ts    # atsf debate (run debate)
src/cli/commands/build.ts     # atsf build (DAG execution)
src/cli/commands/gate/index.ts    # atsf gate (run quality gates)
src/cli/commands/gate/check.ts    # atsf gate check
src/cli/commands/gate/list.ts     # atsf gate list
src/cli/commands/emit.ts      # atsf emit (artifact generation)
src/cli/hooks/init.ts         # Pre-command config loading hook
```

**Test files:**
```
tests/commands/init.test.ts
tests/commands/plan.test.ts
tests/commands/debate.test.ts
tests/commands/build.test.ts
tests/commands/gate.test.ts
tests/commands/emit.test.ts
```

**Key tests to write:**
1. Each command runs without error (happy path with mock provider)
2. `atsf init` creates config file
3. `atsf plan` produces task graph YAML
4. `atsf build` triggers DAGScheduler execution
5. `atsf gate` runs all 5 gates and produces report
6. `atsf emit` produces all 6 artifact files
7. `--output-dir` flag works for all relevant commands
8. `--provider` flag selects correct provider
9. Error handling: meaningful error messages on failure

**Acceptance criteria:**
- [ ] All 9 commands registered with Oclif
- [ ] Each command has `description`, `flags`, `args` defined
- [ ] Pre-command hook loads config
- [ ] Commands use OrchestratorEngine pipeline
- [ ] All tests pass: `pnpm vitest run tests/commands/`

**DO NOT read:** Section 15 (serve/query — separate task)

---

## T16: Serve & Query Engine

**Goal:** Implement the Fastify server, BM25 search, query engine, and MCP bridge.

**Dependencies:** T15

**Spec sections to read:**
- Section 15.1 Overview: lines 5753-5762
- Section 15.2 Architecture: lines 5763-5811
- Section 15.3 API Endpoints: lines 5812-5835
- Section 15.4 Key Endpoint Schemas: lines 5836-5968
- Section 15.5 Query Engine Design: lines 5969-5999
- Section 15.6 atsf serve Command: lines 6000-6044
- Section 15.6.1 Graceful Shutdown: lines 6045-6056
- Section 15.7 atsf query Command: lines 6057-6104
- Section 15.8 MCP Server Bridge: lines 6105-6139
- Section 15.9 Issue Logging System: lines 6140-6152
- Section 15.11 New Dependencies: lines 6171-6180
- Section 15.12 Phase Integration: lines 6181-6186

**Files to create:**
```
src/serve/server.ts              # Fastify server + route registration
src/serve/routes/query.ts        # POST /api/query
src/serve/routes/tasks.ts        # GET /api/tasks, /api/tasks/:id
src/serve/routes/blueprint.ts    # GET /api/blueprint
src/serve/routes/decisions.ts    # GET /api/decisions
src/serve/routes/mpd.ts          # GET /api/mpd
src/serve/routes/validate.ts     # POST /api/validate
src/serve/routes/report-issue.ts # POST /api/report-issue
src/serve/routes/status.ts       # GET /api/status
src/serve/index/artifact-index.ts    # ArtifactIndex (loads + indexes all artifacts)
src/serve/index/bm25-engine.ts       # BM25 search wrapper (wink-bm25-text-search)
src/serve/index/cross-ref.ts         # Cross-reference resolver
src/serve/query-engine.ts            # QueryEngine (BM25 + optional LLM synthesis)
src/serve/issue-log.ts               # IssueLog (in-memory + JSONL persistence)
src/serve/mcp-bridge.ts              # MCP server adapter
src/serve/schemas.ts                 # All request/response Zod schemas
src/cli/commands/serve.ts            # atsf serve command
src/cli/commands/query.ts            # atsf query command
```

**Test files:**
```
tests/commands/serve.test.ts
tests/commands/query.test.ts
```

**Key tests to write:**
1. Server starts on configured port
2. `POST /api/query` returns QueryResponseSchema-valid response
3. BM25 search returns ranked results
4. QueryEngine uses LLM synthesis when `rawContext=false`
5. Graceful shutdown: SIGINT/SIGTERM triggers 5-step shutdown
6. IssueLog persists to `.atsf-issues.jsonl`
7. JSONL concurrency: review CLI uses HTTP when server running
8. MCP tool schemas mirror HTTP endpoint schemas
9. `QueryResponseSchema.superRefine`: escalation required when answerable=false

**Acceptance criteria:**
- [ ] Fastify server runs with all routes registered
- [ ] BM25 search functional with wink-bm25-text-search
- [ ] QueryEngine returns valid QueryResponseSchema responses
- [ ] Graceful shutdown: fastify.close → flush IssueLog → cleanup → exit
- [ ] MCP bridge wraps routes as MCP tools
- [ ] All tests pass: `pnpm vitest run tests/commands/serve.test.ts tests/commands/query.test.ts`

**DO NOT read:** Sections 5-9 (already implemented in earlier tasks)

---

## T17: Escalation & Review System

**Goal:** Implement escalation detection, issue resolution, and the review CLI.

**Dependencies:** T16

**Spec sections to read:**
- Section 15.13 Escalation & Human-in-the-Loop: lines 6187-6192
- Section 15.13.1 Escalation Categories: lines 6193-6203
- Section 15.13.2 Escalation Detection Algorithm: lines 6204-6289
- Section 15.13.3 IssueResolutionSchema: lines 6290-6330
- Section 15.13.4 Extended Issue Log Format: lines 6331-6361
- Section 15.13.5 Review API Endpoints: lines 6362-6411
- Section 15.13.6 Re-indexing Flow: lines 6412-6428
- Section 15.13.7 Orchestrator Integration Guide: lines 6429-6455
- Section 15.13.8 Sequence Diagram: lines 6456-6506

**Files to create:**
```
src/serve/routes/review.ts           # GET /api/review/pending, POST /api/review/:issueId
src/serve/escalation-detector.ts     # ESCALATION_RULES, category→severity mapping,
                                     #   buildQueryEscalation()
src/cli/commands/review/index.ts     # atsf review (list pending)
src/cli/commands/review/answer.ts    # atsf review answer ISS-001
src/cli/commands/review/export.ts    # atsf review export
src/cli/commands/review/import.ts    # atsf review import answers.json
```

**Test files:**
```
tests/commands/review.test.ts
```

**Key tests to write:**
1. Escalation rules fire correctly (topScore < 2.0 → missing_detail, conflict → ambiguous_spec, etc.)
2. `buildQueryEscalation()` constructs EscalatedIssueRecord with correct fields
3. Category→severity mapping: infeasible_constraint → critical, missing_detail → minor, etc.
4. EscalatedIssueRecord.status uses 4 values: pending/answered/dismissed/deferred
5. Resolution: answer stored in JSONL + BM25 re-indexed + event emitted
6. `atsf review answer` opens editor, submits resolution
7. Export/import round-trip preserves data

**Acceptance criteria:**
- [ ] Escalation detection triggers on low confidence/conflict/uncertainty
- [ ] `buildQueryEscalation()` populates all EscalatedIssueRecord fields
- [ ] Review API endpoints functional
- [ ] BM25 re-indexing adds resolved answers with `artifactType: 'human_resolution'`
- [ ] All tests pass: `pnpm vitest run tests/commands/review.test.ts`

**DO NOT read:** Sections 5-9 (already implemented)

---

## T18: Integration Tests

**Goal:** Write end-to-end integration tests covering the 4 major flows.

**Dependencies:** T15, T16, T17

**Spec sections to read:**
- Section 14.4 Testing Strategy (full): lines 5300-5665
- Section 14.4.2 Mock Patterns for LLM Calls: lines 5394-5501

**Test files to create:**
```
tests/integration/pipeline.test.ts           # init → plan → build → gate → emit
tests/integration/debate-flow.test.ts        # Full debate with mock agents
tests/integration/gate-pipeline.test.ts      # All 5 gates on sample artifacts
tests/integration/emitter-pipeline.test.ts   # Emitter pipeline with real templates
tests/integration/cross-ref-validation.test.ts # L3 cross-reference validation
```

**Key tests to write:**
1. Full pipeline: init → plan → debate → build → gate → emit → verify artifacts
2. Debate flow: 3 rounds with mock provider, produces ADR
3. Gate pipeline: all 5 gates run on sample artifacts, report produced
4. Emitter pipeline: produces all 6 files, all validate against schemas
5. Cross-ref validation: all 13 XREF rules pass on valid artifact set

**Acceptance criteria:**
- [ ] All 5 integration tests pass
- [ ] Full pipeline produces valid artifacts end-to-end
- [ ] Mock provider used (no real API calls)
- [ ] All tests pass: `pnpm vitest run tests/integration/`

---

## T19: CLI UI Polish

**Goal:** Implement rich terminal UI with ora spinners, ink dashboard, and progress display.

**Dependencies:** T15

**Spec sections to read:**
- Section 3.5 UI ora + ink: lines 1090-1111
- Section 3.6 Logging pino + pino-pretty: lines 1112-1136
- Section 14.11 Observability and Debugging: lines 5711-5714

**Files to create:**
```
src/telemetry/logger.ts     # pino setup with pino-pretty
src/cli/ui/progress.ts      # ora spinners for each phase
src/cli/ui/dashboard.ts     # ink dashboard (optional, for --interactive mode)
```

**Acceptance criteria:**
- [ ] pino logger configured with structured JSON output
- [ ] pino-pretty used in development mode
- [ ] ora spinners show progress during each pipeline phase
- [ ] Cost display updated in real-time via EventBus subscription

---

## Quick Reference: Section → Task Mapping

| Spec Section | Task | Lines |
|-------------|------|-------|
| 1. Project Overview | (context only) | 50-85 |
| 2. Architecture | T02, T14 | 88-698 |
| 3. CLI Design | T01, T03, T15, T19 | 700-1172 |
| 4. Provider System | T04 | 1174-1437 |
| 5. Task Graph & DAG | T06 | 1439-1788 |
| 6. Debate Engine | T08 | 1789-2299 |
| 7. Quality Gates | T12 | 2301-2759 |
| 8. Contract System | T09 | 2761-3075 |
| 9. Parallel Execution | T05, T07 | 3076-3500 |
| 10. Emitter & Artifacts | T10, T11, T13 | 3500-5105 |
| 11. Dependencies | T01 | 5107-5158 |
| 12. MVP Roadmap | (context only) | 5160-5220 |
| 13. Competitive Positioning | (context only) | 5222-5264 |
| 14. Known Limitations | T18, T19 | 5266-5748 |
| 15. Feedback Loop | T16, T17 | 5749-6506 |
| Appendix A-D | (reference only) | 6508-6618 |

---

## Estimated Task Sizes

| Task | Files | Tests | Complexity |
|------|-------|-------|------------|
| T01 Scaffolding | ~5 config + dirs | 0 | Low |
| T02 Types + EventBus | 7 | 6+ | Medium |
| T03 Config System | 2 | 7+ | Low |
| T04 Provider Adapters | 3 | 9+ | Medium |
| T05 Resilience Layer | 7 | 9+ | High |
| T06 DAG Static | 6 | 10+ | High |
| T07 DAG Runtime | 4 | 10+ | High |
| T08 Debate Engine | 5 | 11+ | High |
| T09 Contract Schemas | 5 | 8+ | Medium |
| T10 Artifact Schemas | 1 (large) | 8+ | Medium |
| T11 Emitter Pipeline | 10 | 8+ | High |
| T12 Quality Gates | 10 | 8+ | High |
| T13 Cross-Ref Validator | 1 | 13+ | Medium |
| T14 Orchestrator | 3 | 6+ | Medium |
| T15 CLI Commands | 9 | 9+ | Medium |
| T16 Serve & Query | 14 | 9+ | High |
| T17 Escalation & Review | 5 | 7+ | Medium |
| T18 Integration Tests | 5 | 5+ | Medium |
| T19 CLI UI Polish | 3 | 0 | Low |

**Total: 19 tasks, ~100 source files, ~140+ tests**

---

*Generated from ATSF-SPECIFICATION.md v1.0 (6,618 lines, post-audit)*
