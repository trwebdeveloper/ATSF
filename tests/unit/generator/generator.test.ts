/**
 * Unit tests for generate() — the main generator pipeline.
 *
 * Mocks the ProviderAdapter to return structured objects for each of the 5 LLM calls,
 * then verifies the shape of GeneratorResult, call count, agent normalisation, default
 * metadata fill-in, and abort-signal handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generate } from '../../../src/generator/generator.js';
import type { ProviderAdapter, GenerateResponse } from '../../../src/providers/types.js';
import type { GeneratorConfig } from '../../../src/generator/types.js';

/* ------------------------------------------------------------------ */
/*  Mock data returned by the fake provider                            */
/* ------------------------------------------------------------------ */

/** Call 1 — TaskGraph: a minimal valid task graph with two tasks. */
const MOCK_TASK_GRAPH = {
  project: {
    name: 'test-project',
    description: 'A test project for unit testing the generator pipeline',
    techStack: [{ name: 'TypeScript', purpose: 'Primary language' }],
    constraints: ['Must use ESM modules'],
  },
  tasks: [
    {
      id: 'TASK-001',
      name: 'Setup project scaffolding',
      description: 'Initialize the project structure with package.json and tsconfig',
      agent: 'architect',
      type: 'architecture',
      dependsOn: [],
      filesWrite: ['package.json', 'tsconfig.json'],
      filesRead: [],
      priority: 1,
      estimatedTokens: 5000,
      category: 'setup',
      acceptanceCriteria: [
        { description: 'package.json exists with valid fields', testable: true },
        { description: 'tsconfig.json compiles with zero errors', testable: true },
      ],
      tags: ['setup'],
    },
    {
      id: 'TASK-002',
      name: 'Implement core module',
      description: 'Build the core business logic for the project',
      agent: 'builder',
      type: 'feature',
      dependsOn: ['TASK-001'],
      filesWrite: ['src/core.ts'],
      filesRead: ['package.json'],
      priority: 2,
      estimatedTokens: 15000,
      category: 'implementation',
      acceptanceCriteria: [
        { description: 'Core module exports required functions', testable: true },
      ],
      tags: ['core'],
    },
  ],
};

/** Call 2 — RepoBlueprint: minimal valid blueprint. */
const MOCK_REPO_BLUEPRINT = {
  projectName: 'test-project',
  root: [
    { name: 'src', type: 'dir', purpose: 'Source code directory', children: [
      { name: 'core.ts', type: 'file', purpose: 'Core module', language: 'typescript' },
    ] },
    { name: 'package.json', type: 'file', purpose: 'Node.js package manifest', language: 'json' },
    { name: 'tsconfig.json', type: 'file', purpose: 'TypeScript configuration', language: 'json' },
  ],
};

/** Call 3 — MPD Core: executiveSummary, projectOverview, technicalArchitecture, componentDesign. */
const MOCK_MPD_CORE = {
  executiveSummary: {
    projectName: 'test-project',
    oneLiner: 'A test project for generator unit tests',
    objectives: ['Validate generator pipeline'],
    targetAudience: ['Developers'],
    scope: { inScope: ['Core module'], outOfScope: ['Deployment'] },
  },
  projectOverview: {
    background: 'This project demonstrates the generator pipeline',
    problemStatement: 'Need to verify generator correctness',
    proposedSolution: 'Comprehensive unit tests with mock provider',
    successCriteria: ['All tests pass'],
    assumptions: [{ id: 'ASMP-001', description: 'Provider returns valid objects', source: 'unit test' }],
  },
  technicalArchitecture: {
    overview: 'Simple TypeScript project with ESM modules',
    diagrams: [],
    patterns: [{ name: 'Module pattern', rationale: 'Clean separation of concerns' }],
    techStack: [{ name: 'TypeScript', purpose: 'Type safety' }],
  },
  componentDesign: {
    components: [
      {
        name: 'Core',
        description: 'Core business logic component',
        responsibilities: ['Process data'],
        interfaces: ['processData()'],
        dependencies: [],
        taskRefs: ['TASK-002'],
      },
    ],
  },
};

/** Call 4 — MPD Design: dataModel, apiDesign, securityConsiderations, testingStrategy. */
const MOCK_MPD_DESIGN = {
  dataModel: {
    overview: 'Simple data model with a single entity',
    entities: [
      {
        name: 'Item',
        description: 'A data item processed by the core module',
        fields: [{ name: 'id', type: 'string', description: 'Unique identifier' }],
        relationships: [],
      },
    ],
  },
  apiDesign: {
    overview: 'No external API in this project',
    endpoints: [],
    authStrategy: 'none',
  },
  securityConsiderations: {
    overview: 'Minimal security requirements for a CLI tool',
    threatModel: [],
  },
  testingStrategy: {
    overview: 'Unit tests with Vitest achieving 80% coverage',
    levels: [{ name: 'unit', description: 'Unit tests for all modules', tools: ['vitest'] }],
    taskRefs: [],
  },
};

/** Call 5 — MPD Plan: deploymentPlan, riskAssessment, timeline, glossary, appendices. */
const MOCK_MPD_PLAN = {
  deploymentPlan: {
    overview: 'Publish to npm as a CLI package for distribution',
    environments: [{ name: 'production', purpose: 'npm registry' }],
    cicdPipeline: 'GitHub Actions',
  },
  riskAssessment: {
    risks: [
      { id: 'RISK-001', description: 'Provider API changes may break integration', probability: 'low', impact: 'medium', mitigation: 'Pin provider SDK versions' },
    ],
  },
  timeline: {
    phases: [{ name: 'Phase 1', description: 'Initial implementation', taskRefs: ['TASK-001', 'TASK-002'] }],
    criticalPath: ['TASK-001', 'TASK-002'],
  },
  glossary: {
    terms: [{ term: 'MPD', definition: 'Master Planning Document' }],
  },
  appendices: {
    adrs: [],
    references: [],
  },
};

/* ------------------------------------------------------------------ */
/*  Helper: build a mock GenerateResponse wrapper                      */
/* ------------------------------------------------------------------ */

function makeResponse(obj: unknown, tokens = 1000): GenerateResponse {
  return {
    content: JSON.stringify(obj),
    object: obj,
    model: 'mock-model',
    finishReason: 'stop',
    usage: {
      promptTokens: Math.floor(tokens * 0.6),
      completionTokens: Math.floor(tokens * 0.4),
      totalTokens: tokens,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Mock provider factory                                              */
/* ------------------------------------------------------------------ */

function createMockProvider(): ProviderAdapter & { generate: ReturnType<typeof vi.fn> } {
  let callIndex = 0;
  const responses = [
    makeResponse(MOCK_TASK_GRAPH, 2000),       // Call 1: TaskGraph
    makeResponse(MOCK_REPO_BLUEPRINT, 1500),    // Call 2: RepoBlueprint
    makeResponse(MOCK_MPD_CORE, 3000),          // Call 3: MPD Core
    makeResponse(MOCK_MPD_DESIGN, 2500),        // Call 4: MPD Design
    makeResponse(MOCK_MPD_PLAN, 2000),          // Call 5: MPD Plan
  ];

  return {
    id: 'mock-provider',
    name: 'Mock Provider',
    supportedModels: ['mock-model'],
    generate: vi.fn(async () => {
      const idx = callIndex++;
      return responses[idx] ?? makeResponse({}, 100);
    }),
    healthCheck: vi.fn(async () => true),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('generate()', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let config: GeneratorConfig;

  beforeEach(() => {
    provider = createMockProvider();
    config = { provider, model: 'mock-model', lang: 'en' };
  });

  // ── Test 1: returns all required fields ───────────────────────────
  it('returns all required fields in GeneratorResult', async () => {
    const result = await generate('Build a CLI tool', 'test-project', config);

    // Top-level keys
    expect(result).toHaveProperty('taskGraphInput');
    expect(result).toHaveProperty('repoBlueprintInput');
    expect(result).toHaveProperty('mpdInput');
    expect(result).toHaveProperty('ticketsInput');
    expect(result).toHaveProperty('promptPackInput');
    expect(result).toHaveProperty('totalTokensUsed');
    expect(result).toHaveProperty('totalCostUsd');

    // taskGraphInput shape
    expect(result.taskGraphInput.project).toBeDefined();
    expect(result.taskGraphInput.tasks).toBeInstanceOf(Array);
    expect(result.taskGraphInput.tasks.length).toBe(2);

    // repoBlueprintInput shape
    expect(result.repoBlueprintInput.projectName).toBe('test-project');
    expect(result.repoBlueprintInput.root).toBeInstanceOf(Array);
    expect(result.repoBlueprintInput.root.length).toBe(3);

    // mpdInput shape — all 13 default sections should be present
    const mpd = result.mpdInput as Record<string, unknown>;
    expect(mpd.executiveSummary).toBeDefined();
    expect(mpd.projectOverview).toBeDefined();
    expect(mpd.technicalArchitecture).toBeDefined();
    expect(mpd.componentDesign).toBeDefined();
    expect(mpd.dataModel).toBeDefined();
    expect(mpd.apiDesign).toBeDefined();
    expect(mpd.securityConsiderations).toBeDefined();
    expect(mpd.testingStrategy).toBeDefined();
    expect(mpd.deploymentPlan).toBeDefined();
    expect(mpd.riskAssessment).toBeDefined();
    expect(mpd.timeline).toBeDefined();
    expect(mpd.glossary).toBeDefined();
    expect(mpd.appendices).toBeDefined();

    // tickets and prompt packs are derived 1:1 from tasks
    expect(result.ticketsInput.length).toBe(2);
    expect(result.promptPackInput.length).toBe(2);

    // Token/cost accumulators are positive numbers
    expect(result.totalTokensUsed).toBeGreaterThan(0);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  // ── Test 2: calls provider.generate() exactly 5 times ────────────
  it('calls provider.generate() exactly 5 times', async () => {
    await generate('Build a CLI tool', 'test-project', config);

    expect(provider.generate).toHaveBeenCalledTimes(5);
  });

  // ── Test 3: normalizes agent types ────────────────────────────────
  it('normalizes non-canonical agent types to canonical values', async () => {
    // Override mock to return a task with non-canonical agent 'tester'
    const taskGraphWithTester = {
      ...MOCK_TASK_GRAPH,
      tasks: [
        {
          ...MOCK_TASK_GRAPH.tasks[0],
          agent: 'tester',     // should become 'reviewer'
        },
        {
          ...MOCK_TASK_GRAPH.tasks[1],
          agent: 'designer',   // should become 'architect'
          type: 'deployment',  // should become 'infrastructure'
        },
      ],
    };

    let callIndex = 0;
    const responses = [
      makeResponse(taskGraphWithTester, 2000),
      makeResponse(MOCK_REPO_BLUEPRINT, 1500),
      makeResponse(MOCK_MPD_CORE, 3000),
      makeResponse(MOCK_MPD_DESIGN, 2500),
      makeResponse(MOCK_MPD_PLAN, 2000),
    ];

    provider.generate.mockImplementation(async () => {
      return responses[callIndex++] ?? makeResponse({}, 100);
    });

    const result = await generate('Build a CLI tool', 'test-project', config);

    // 'tester' normalizes to 'reviewer'
    expect(result.taskGraphInput.tasks[0].agent).toBe('reviewer');
    // 'designer' normalizes to 'architect'
    expect(result.taskGraphInput.tasks[1].agent).toBe('architect');
    // 'deployment' normalizes to 'infrastructure'
    expect(result.taskGraphInput.tasks[1].type).toBe('infrastructure');
  });

  // ── Test 4: fills default project metadata when model omits it ────
  it('fills default project metadata when LLM omits project field', async () => {
    // Return a task graph *without* the project field
    const taskGraphNoProject = {
      tasks: MOCK_TASK_GRAPH.tasks,
      // no project field — generator should fill defaults
    };

    let callIndex = 0;
    const responses = [
      makeResponse(taskGraphNoProject, 2000),
      makeResponse(MOCK_REPO_BLUEPRINT, 1500),
      makeResponse(MOCK_MPD_CORE, 3000),
      makeResponse(MOCK_MPD_DESIGN, 2500),
      makeResponse(MOCK_MPD_PLAN, 2000),
    ];

    provider.generate.mockImplementation(async () => {
      return responses[callIndex++] ?? makeResponse({}, 100);
    });

    const result = await generate(
      'A detailed project description that is long enough',
      'my-project',
      config,
    );

    // Generator should have fallen back to the projectName argument
    expect(result.taskGraphInput.project.name).toBe('my-project');
    // Description should be sliced from projectDescription
    expect(result.taskGraphInput.project.description).toBe(
      'A detailed project description that is long enough',
    );
    // Default empty arrays
    expect(result.taskGraphInput.project.techStack).toEqual([]);
    expect(result.taskGraphInput.project.constraints).toEqual([]);
  });

  // ── Test 5: throws when abort signal is already aborted ───────────
  it('throws immediately when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const abortConfig: GeneratorConfig = {
      ...config,
      signal: controller.signal,
    };

    await expect(
      generate('Build a CLI tool', 'test-project', abortConfig),
    ).rejects.toThrow('Aborted');

    // Provider should never have been called
    expect(provider.generate).not.toHaveBeenCalled();
  });

  // ── Additional: verifies token accumulation across all 5 calls ────
  it('accumulates token usage correctly across all 5 calls', async () => {
    const result = await generate('Build a CLI tool', 'test-project', config);

    // 2000 + 1500 + 3000 + 2500 + 2000 = 11000
    expect(result.totalTokensUsed).toBe(11000);
    // cost = totalTokens * 0.000001 per call
    expect(result.totalCostUsd).toBeCloseTo(0.011, 6);
  });

  // ── Additional: unknown agent/type falls back to builder/feature ──
  it('maps completely unknown agent to "builder" and unknown type to "feature"', async () => {
    const taskGraphUnknown = {
      ...MOCK_TASK_GRAPH,
      tasks: [
        {
          ...MOCK_TASK_GRAPH.tasks[0],
          agent: 'wizard',      // not in VALID_AGENTS or AGENT_MAP
          type: 'magic',        // not in VALID_TYPES or TYPE_MAP
        },
      ],
    };

    let callIndex = 0;
    const responses = [
      makeResponse(taskGraphUnknown, 2000),
      makeResponse(MOCK_REPO_BLUEPRINT, 1500),
      makeResponse(MOCK_MPD_CORE, 3000),
      makeResponse(MOCK_MPD_DESIGN, 2500),
      makeResponse(MOCK_MPD_PLAN, 2000),
    ];

    provider.generate.mockImplementation(async () => {
      return responses[callIndex++] ?? makeResponse({}, 100);
    });

    const result = await generate('Build a CLI tool', 'test-project', config);

    expect(result.taskGraphInput.tasks[0].agent).toBe('builder');
    expect(result.taskGraphInput.tasks[0].type).toBe('feature');
  });

  // ── Additional: repoBlueprintInput falls back to projectName arg ──
  it('uses the projectName argument when LLM omits projectName in blueprint', async () => {
    const blueprintNoName = {
      root: MOCK_REPO_BLUEPRINT.root,
      // no projectName field
    };

    let callIndex = 0;
    const responses = [
      makeResponse(MOCK_TASK_GRAPH, 2000),
      makeResponse(blueprintNoName, 1500),
      makeResponse(MOCK_MPD_CORE, 3000),
      makeResponse(MOCK_MPD_DESIGN, 2500),
      makeResponse(MOCK_MPD_PLAN, 2000),
    ];

    provider.generate.mockImplementation(async () => {
      return responses[callIndex++] ?? makeResponse({}, 100);
    });

    const result = await generate('Build something', 'fallback-name', config);

    expect(result.repoBlueprintInput.projectName).toBe('fallback-name');
  });
});
