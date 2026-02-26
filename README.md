# ATSF - AI Specification Engine

CLI tool that transforms natural-language project descriptions into implementation-ready artifacts: task graphs, repository blueprints, tickets, AI prompt packs, and architecture decision records.

## What It Does

You describe your project in plain language. ATSF runs a multi-agent debate, validates the output through quality gates, and produces 6 structured artifacts that AI coders (Claude Code, Cursor, Aider) can consume directly.

**Output Artifacts:**

| Artifact | Format | Description |
|----------|--------|-------------|
| `task_graph.yaml` | YAML | Dependency graph of implementation tasks |
| `repo_blueprint.yaml` | YAML | Planned file/directory structure |
| `MPD.md` | Markdown | Master Project Document with architecture decisions |
| `tickets/*.md` | Markdown | One ticket per task with acceptance criteria |
| `ai_prompt_pack/*.md` | Markdown | Ready-to-use prompts for AI coders |
| `manifest.json` | JSON | Generation metadata and checksums |

## Requirements

- Node.js >= 20.0.0
- pnpm

## Installation

```bash
git clone https://github.com/trwebdeveloper/ATSF.git
cd ATSF
pnpm install
```

## Quick Start

```bash
# 1. Initialize a new project
atsf init --name "my-project" --description "An e-commerce platform with auth and payments"

# 2. Generate the execution plan (task graph)
atsf plan --dir .

# 3. Run multi-agent debate on the plan
atsf debate --dir .

# 4. Execute the DAG-scheduled task graph
atsf build --dir .

# 5. Run quality gates
atsf gate --dir .

# 6. Emit all artifacts
atsf emit --dir .
```

## CLI Commands

### Core Pipeline

| Command | Description |
|---------|-------------|
| `atsf init` | Initialize a new ATSF project with config and workspace |
| `atsf plan` | Generate execution plan from project description |
| `atsf debate` | Run a multi-agent debate on the plan |
| `atsf build` | Execute DAG-scheduled task graph |
| `atsf emit` | Emit build artifacts (YAML, Markdown, tickets, prompts) |

### Quality Gates

| Command | Description |
|---------|-------------|
| `atsf gate` | Run quality gate checks on artifacts |
| `atsf gate check` | Run a specific quality gate check |
| `atsf gate list` | List all available quality gates |

5 built-in gates: **coverage**, **consistency**, **testability**, **buildability**, **security**. Failed gates trigger an auto-fix engine (up to 3 rounds).

### Feedback Loop

| Command | Description |
|---------|-------------|
| `atsf serve` | Start the ATSF feedback server for AI coder integration |
| `atsf query` | Query ATSF artifacts about the project |
| `atsf review` | List pending escalated issues awaiting human review |
| `atsf review answer` | Submit a resolution for an escalated issue |
| `atsf review export` | Export pending issues to a JSON file for offline review |
| `atsf review import` | Import answers from a JSON file and apply them |

## HTTP API

`atsf serve` starts a Fastify server (default: `http://127.0.0.1:4567`) with 17 endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/status` | Project implementation status dashboard |
| `POST` | `/api/query` | Natural language Q&A about the project |
| `GET` | `/api/tasks` | List all tasks with filtering |
| `GET` | `/api/tasks/:id` | Get detailed task information |
| `GET` | `/api/tasks/:id/prompt` | Get AI prompt pack for a task |
| `GET` | `/api/tasks/:id/ticket` | Get ticket for a task |
| `GET` | `/api/tasks/:id/deps` | Get task dependency graph |
| `GET` | `/api/blueprint` | Get repository blueprint |
| `GET` | `/api/decisions` | List architecture decisions |
| `GET` | `/api/decisions/:id` | Get specific ADR details |
| `GET` | `/api/mpd` | Get full Master Project Document |
| `GET` | `/api/mpd/:section` | Get specific MPD section |
| `POST` | `/api/validate` | Validate AI coder output against contract |
| `POST` | `/api/report-issue` | Report implementation issue or blocker |
| `GET` | `/api/review/pending` | List pending escalated issues |
| `POST` | `/api/review/:issueId` | Resolve an escalated issue |

### Query Example

```bash
# Via CLI (auto-connects to running server or runs in-process)
atsf query "What files does TASK-001 create?"
atsf query "Explain the auth module" --task TASK-005
atsf query "List all dependencies" --format json

# Via HTTP
curl -X POST http://127.0.0.1:4567/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What files does TASK-001 create?", "maxChunks": 5}'
```

## MCP Integration

`atsf serve --mcp` exposes 10 tools via the Model Context Protocol for direct integration with Claude Code, Cursor, and other MCP-aware tools:

```bash
# Add ATSF as an MCP server in Claude Code
claude mcp add atsf -- atsf serve --mcp
```

**Available MCP Tools:**

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

## Architecture

```
src/
  shared/        # Branded types (TaskId, AgentId), ATSFError hierarchy
  events/        # EventBus with 22 discriminated union event types
  config/        # cosmiconfig + Zod schema (8 nested sections)
  providers/     # ProviderAdapter interface, OpenRouter + ClaudeCode adapters
  resilience/    # CircuitBreaker, Semaphore, RateLimiter, CostTracker, AdaptiveConcurrency
  dag/           # YAML -> DAG builder, DFS cycle detection, Kahn toposort, parallel executor
  debate/        # Multi-agent debate engine (N rounds), judge synthesis, BM25 convergence, ADR generator
  contracts/     # 7 artifact Zod schemas, L1/L2/L3 validation pipeline, versioned envelope
  emitter/       # VirtualFS (atomic flush), 6 artifact emitters, cross-ref validator (13 XREF rules)
  gates/         # 5 quality gates, auto-fix engine, gate registry, 4 reporters
  orchestrator/  # Pipeline wiring: debate -> build -> gate -> emit
  serve/         # Fastify server, BM25 search, QueryEngine, IssueLog, MCP bridge, escalation detector
  cli/           # Oclif commands + review subcommands + UI (ora spinners, ink dashboard)
  telemetry/     # Pino structured logger with pino-pretty dev mode
```

### Pipeline Flow

```
atsf init → project config
    |
atsf plan → DAG (task dependency graph)
    |
atsf debate → multi-agent debate (N rounds)
    |            proposer -> critic -> convergence check
    |            final round: judge synthesis -> ADR
    |
atsf build → parallel execution on DAG
    |           resilience: circuit breaker, rate limiter, retry
    |
atsf gate → 5 quality checks
    |          failed? -> auto-fix engine (max 3 rounds)
    |
atsf emit → 6 artifact files
    |          VirtualFS with atomic write
    |
atsf serve → Fastify + BM25 search
               AI coders query via HTTP/MCP
```

## Configuration

ATSF uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) for configuration. Create any of these files in your project root:

- `.atsfrc.json`
- `.atsfrc.yaml`
- `.atsfrc.ts`
- `atsf.config.ts`
- `package.json` (`"atsf"` key)

```yaml
# .atsfrc.yaml
provider:
  default: openrouter

debate:
  rounds: 3
  engine: judge
  convergenceThreshold: 0.8

build:
  maxConcurrency: 5
  timeout: 300000

gate:
  threshold: 0.8
  autoFix: true
  maxFixRounds: 3
  reporter: console

output:
  directory: ./atsf-output
  formats:
    - task_graph
    - repo_blueprint
    - mpd
    - tickets
    - ai_prompt_pack

serve:
  port: 4567
  host: 127.0.0.1
  cors: true
  llmEnabled: true
  maxChunks: 10
```

## Development

```bash
# Type-check (zero errors required)
pnpm tsc --noEmit

# Run all tests
pnpm vitest run

# Run tests for a specific module
pnpm vitest run tests/unit/debate/

# Run integration tests
pnpm vitest run tests/integration/

# Lint
pnpm lint

# All three (run after every change)
pnpm tsc --noEmit && pnpm vitest run && pnpm lint
```

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | >= 20.0.0 | Runtime |
| TypeScript | ^5.7.0 | Language (strict mode, ESM-only) |
| pnpm | - | Package manager |
| Oclif | ^4.8.0 | CLI framework |
| Zod | ^4.3.6 | Runtime validation |
| Vitest | ^3.0.0 | Test framework |
| Fastify | ^5.0.0 | HTTP server (`atsf serve`) |
| wink-bm25-text-search | ^3.1.0 | Full-text search |
| pino | ^9.0.0 | Structured logging |
| cosmiconfig | ^9.0.0 | Config loading |
| Eta | ^4.5.1 | Template engine |
| p-queue | ^9.1.0 | Concurrency control |
| chokidar | ^4.0.0 | File watching |
| ink | ^5.0.0 | Terminal UI (dashboard) |
| ora | ^8.0.0 | Terminal spinners |
| @modelcontextprotocol/sdk | ^1.0.0 | MCP server bridge |

## Project Stats

| Metric | Value |
|--------|-------|
| Source files | 104 |
| Source lines | ~14,000 |
| Test files | 58 |
| Test lines | ~16,700 |
| Tests | 917 |
| Pass rate | 100% |
| Type errors | 0 |

## License

ISC
