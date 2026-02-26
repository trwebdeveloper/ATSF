# ATSF — AI Specification Engine

CLI tool that transforms natural-language project descriptions into implementation-ready artifacts: `task_graph.yaml`, `repo_blueprint.yaml`, `MPD.md`, `tickets/`, `ai_prompt_pack/`, `manifest.json`.

## Tech Stack

- Node.js 20+ / TypeScript strict / ESM-only (`"type": "module"`)
- pnpm (package manager)
- Oclif v4 (CLI framework)
- Zod v4 (runtime validation)
- Vitest ^3.0 (testing)
- cosmiconfig v9 (config loading)
- marked + highlight.js (markdown rendering)

## Commands

```bash
pnpm install                    # Install dependencies
pnpm tsc --noEmit               # Type-check (zero errors required)
pnpm vitest run                 # Run all tests
pnpm vitest run tests/unit/X/   # Run tests for a specific module
pnpm lint                       # ESLint check
```

## Architecture

```
src/
  shared/       # Branded types, error hierarchy
  events/       # EventBus (22 event types, discriminated union)
  config/       # cosmiconfig + Zod schema
  providers/    # ProviderAdapter interface, OpenRouter + ClaudeCode adapters
  resilience/   # RetryPolicy, CircuitBreaker, Semaphore, RateLimiter
  dag/          # YAML → DAG static builder + topological runtime executor
  debate/       # Multi-agent debate engine (N rounds, judge synthesis)
  gates/        # Quality gate engine (lint, test, schema, custom)
  contracts/    # Zod schemas for all 6 output artifacts
  artifacts/    # ArtifactSchema + per-artifact emitters
  cross-ref/    # Cross-reference validator
  quality/      # Gate orchestration + enforcement
  orchestrator/ # Pipeline stages → OrchestratorEngine
  commands/     # Oclif commands: init, generate, serve, query
  templates/    # Eta template engine + VirtualFS
  serve/        # HTTP/SSE server for interactive review
```

## Implementation Guide

IMPORTANT: Read `IMPLEMENTATION-PLAYBOOK.md` for task-by-task instructions. It contains:
- 19 ordered tasks (T01–T19) with dependency graph
- Exact spec section line numbers for each task
- File lists, test files, acceptance criteria per task
- "DO NOT read" guidance to limit context usage

IMPORTANT: Read spec sections ONLY as directed by the playbook. Do NOT read the full 6,618-line spec at once.

## Conventions

- TDD: write tests before implementation
- Commit format: `T{XX}: short description`
- One task = one commit
- All public functions must have explicit return types
- Use branded types for `TaskId`, `AgentId` etc. (see spec Section 2.3)
- Paths normalized to POSIX forward slashes + lowercase (`normalizePath()`)
- Errors: extend `ATSFError` base class, never throw raw strings

## Verification (run after every task)

```bash
pnpm tsc --noEmit && pnpm vitest run && pnpm lint
```

All three must pass before moving to the next task.

## Session Recovery

If you are starting a new session and don't know where the project left off:

1. Run `git log --oneline -20` to see completed tasks
2. Commits follow `T{XX}: ...` format — the last T number is the last completed task
3. Open `IMPLEMENTATION-PLAYBOOK.md`, find the next task after the last completed one
4. Continue from there

If no commits exist beyond T00, start from T01.
