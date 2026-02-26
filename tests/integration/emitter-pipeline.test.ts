/**
 * Integration tests for EmitterPipeline — emitter pipeline with real emitters.
 *
 * Tests verify:
 * 1. Pipeline runs all 6 emitters in sequence
 * 2. All 6 expected output files are present in VFS after pipeline run
 * 3. Produced files validate against artifact schemas
 * 4. VirtualFS contains correct file count
 * 5. Manifest references all other files
 * 6. task_graph.yaml is valid YAML parseable by the schema
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { EmitterPipeline } from '../../src/emitter/pipeline.js';
import { VirtualFS } from '../../src/emitter/virtual-fs.js';
import { TaskGraphEmitter } from '../../src/emitter/emitters/task-graph.js';
import { RepoBlueprintEmitter } from '../../src/emitter/emitters/repo-blueprint.js';
import { MpdEmitter } from '../../src/emitter/emitters/mpd.js';
import { TicketsEmitter } from '../../src/emitter/emitters/tickets.js';
import { PromptPackEmitter } from '../../src/emitter/emitters/prompt-pack.js';
import { ManifestEmitter } from '../../src/emitter/emitters/manifest.js';
import type { EmitterContext } from '../../src/emitter/types.js';
import {
  TaskGraphSchema,
  RepoBlueprintSchema,
  ManifestSchema,
  TicketSchema,
  AiPromptPackSchema,
} from '../../src/contracts/artifact-schemas.js';

// ---------------------------------------------------------------------------
// Sample data for the emitter pipeline
// ---------------------------------------------------------------------------

const GENERATED_AT = '2026-01-01T00:00:00.000Z';
const PROJECT_NAME = 'emitter-test-project';

function buildEmitterContext(): EmitterContext {
  const vfs = new VirtualFS();

  return {
    projectName: PROJECT_NAME,
    generatedAt: GENERATED_AT,
    lang: 'en',
    vfs,
    totalCostUsd: 1.23,
    durationMs: 4567,
    totalTasks: 2,
    taskGraphInput: {
      project: {
        name: PROJECT_NAME,
        description: 'A test project for emitter pipeline integration testing',
        constraints: ['TypeScript strict mode'],
      },
      tasks: [
        {
          id: 'TASK-001',
          name: 'Create base module',
          description: 'Create the base module with core utilities and helpers for the project',
          agent: 'builder' as const,
          type: 'feature' as const,
          dependsOn: [],
          filesWrite: ['src/base.ts'],
          filesRead: [],
          priority: 4,
          acceptanceCriteria: [
            { description: 'Base module exports all required utilities correctly', testable: true },
          ],
          tags: ['core'],
        },
        {
          id: 'TASK-002',
          name: 'Create main entry point',
          description: 'Create the main entry point that imports and re-exports from base module',
          agent: 'builder' as const,
          type: 'feature' as const,
          dependsOn: ['TASK-001'],
          filesWrite: ['src/index.ts'],
          filesRead: ['src/base.ts'],
          priority: 3,
          acceptanceCriteria: [
            { description: 'Main entry point exports all public API symbols', testable: true },
          ],
          tags: ['entry'],
        },
      ],
    },
    repoBlueprintInput: {
      projectName: PROJECT_NAME,
      root: [
        {
          name: 'src',
          type: 'dir' as const,
          purpose: 'Source code directory',
          children: [
            { name: 'base.ts', type: 'file' as const, purpose: 'Base utilities', generatedBy: 'TASK-001' },
            { name: 'index.ts', type: 'file' as const, purpose: 'Main entry point', generatedBy: 'TASK-002' },
          ],
        },
      ],
    },
    mpdInput: {
      executiveSummary: {
        projectName: PROJECT_NAME,
        oneLiner: 'A focused test project for emitter pipeline integration testing',
        objectives: ['Validate emitter pipeline produces correct output'],
        targetAudience: ['Test framework'],
        scope: {
          inScope: ['Emitter pipeline testing'],
          outOfScope: ['Production deployment'],
        },
      },
      projectOverview: {
        background: 'This project tests the ATSF emitter pipeline integration',
        problemStatement: 'We need to validate that all emitters produce correct artifacts',
        proposedSolution: 'Run the full emitter pipeline with sample data and validate output',
        successCriteria: ['All 6 artifact types are produced correctly'],
        assumptions: [],
      },
      technicalArchitecture: {
        overview: 'Simple two-layer architecture with base module and entry point',
        diagrams: [
          { type: 'flowchart' as const, title: 'Module Architecture', source: 'graph TD; Base-->Index;' },
        ],
        patterns: [
          { name: 'Module Pattern', rationale: 'Encapsulates functionality in well-defined modules for clean separation' },
        ],
        techStack: [
          { name: 'TypeScript', purpose: 'Type-safe implementation', category: 'language' as const },
        ],
      },
      componentDesign: {
        components: [
          {
            name: 'Base Module',
            description: 'Core utilities and helpers for the project',
            responsibilities: ['Provide utility functions', 'Export core types'],
            interfaces: [],
            dependencies: [],
            taskRefs: ['TASK-001'],
          },
        ],
      },
      dataModel: {
        overview: 'No persistent data model required for this module',
        entities: [],
      },
      apiDesign: {
        overview: 'No external API for this module',
        endpoints: [],
      },
      securityConsiderations: {
        overview: 'No special security considerations for a utility module',
        threatModel: [],
      },
      testingStrategy: {
        overview: 'Unit tests validate each utility function in isolation',
        levels: [
          {
            name: 'unit' as const,
            description: 'Unit tests for all utility functions',
            tools: ['vitest'],
            coverageTarget: '80%',
          },
        ],
        taskRefs: ['TASK-001', 'TASK-002'],
      },
      deploymentPlan: {
        overview: 'Published as an npm package',
        environments: [
          { name: 'npm registry', purpose: 'Public package distribution' },
        ],
      },
      riskAssessment: {
        risks: [
          {
            id: 'RISK-001',
            description: 'Breaking changes in exported API may affect consumers',
            probability: 'low' as const,
            impact: 'minor' as const,
            mitigation: 'Use semantic versioning and maintain backward compatibility',
          },
        ],
      },
      timeline: {
        phases: [
          {
            name: 'Development',
            description: 'Implement all modules',
            taskRefs: ['TASK-001', 'TASK-002'],
          },
        ],
        criticalPath: ['TASK-001', 'TASK-002'],
      },
      glossary: { terms: [] },
      appendices: { adrs: [], references: [] },
    },
    ticketsInput: [
      {
        frontmatter: {
          id: 'TASK-001',
          title: 'Create base module',
          type: 'feature' as const,
          priority: 'high' as const,
          estimate: '2h',
          dependencies: [],
          labels: ['core'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Create the base module with core utilities and helpers for the project',
          acceptanceCriteria: [
            { given: 'Base module is imported', when: 'Utility functions are called', then: 'They return correct results' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-002',
          title: 'Create main entry point',
          type: 'feature' as const,
          priority: 'medium' as const,
          estimate: '1h',
          dependencies: ['TASK-001'],
          labels: ['entry'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Create the main entry point that imports and re-exports from base module',
          acceptanceCriteria: [
            { given: 'The package is imported', when: 'Public API symbols are accessed', then: 'All exports are available' },
          ],
          relatedDecisions: [],
        },
      },
    ],
    promptPackInput: [
      {
        taskId: 'TASK-001',
        taskName: 'Create base module',
        context: 'Create the base module with core utilities and helper functions for the test project',
        contract: {
          outputFiles: [
            { filePath: 'src/base.ts', exports: ['baseUtil'], description: 'Base utilities module' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [],
        instructions: [
          { step: 1, instruction: 'Create src/base.ts with core utility functions' },
        ],
        constraints: ['Use TypeScript strict mode', 'Export all public utilities'],
        testCriteria: ['All utilities are exported correctly'],
        estimatedComplexity: 'low' as const,
        suggestedModel: 'fast' as const,
        previousTaskOutputs: [],
      },
      {
        taskId: 'TASK-002',
        taskName: 'Create main entry point',
        context: 'Create the main entry point that re-exports everything from the base module',
        contract: {
          outputFiles: [
            { filePath: 'src/index.ts', exports: ['baseUtil'], description: 'Main entry point' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [
          { filePath: 'src/base.ts', sourceTask: 'TASK-001' },
        ],
        instructions: [
          { step: 1, instruction: 'Import all exports from src/base.ts' },
          { step: 2, instruction: 'Re-export them from src/index.ts' },
        ],
        constraints: ['Re-export all public API'],
        testCriteria: ['All base module exports are accessible via index'],
        estimatedComplexity: 'trivial' as const,
        suggestedModel: 'fast' as const,
        previousTaskOutputs: [
          { taskId: 'TASK-001', filePath: 'src/base.ts', injectionPoint: 'imports', mode: 'full' as const },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helper: create and run the full emitter pipeline
// ---------------------------------------------------------------------------

async function runFullPipeline(): Promise<VirtualFS> {
  const ctx = buildEmitterContext();
  const pipeline = new EmitterPipeline([
    new TaskGraphEmitter(),
    new RepoBlueprintEmitter(),
    new MpdEmitter(),
    new TicketsEmitter(),
    new PromptPackEmitter(),
    new ManifestEmitter(),
  ]);
  await pipeline.run(ctx);
  return ctx.vfs;
}

// ---------------------------------------------------------------------------
// Test Suite 1: File presence
// ---------------------------------------------------------------------------

describe('EmitterPipeline — file presence', () => {
  let vfs: VirtualFS;

  beforeEach(async () => {
    vfs = await runFullPipeline();
  });

  it('produces task_graph.yaml', () => {
    const files = vfs.listFiles();
    expect(files).toContain('task_graph.yaml');
  });

  it('produces repo_blueprint.yaml', () => {
    expect(vfs.listFiles()).toContain('repo_blueprint.yaml');
  });

  it('produces MPD.md', () => {
    expect(vfs.listFiles()).toContain('MPD.md');
  });

  it('produces one ticket file per task', () => {
    const files = vfs.listFiles();
    expect(files).toContain('tickets/TASK-001.md');
    expect(files).toContain('tickets/TASK-002.md');
  });

  it('produces one prompt pack file per task', () => {
    const files = vfs.listFiles();
    expect(files).toContain('ai_prompt_pack/TASK-001.md');
    expect(files).toContain('ai_prompt_pack/TASK-002.md');
  });

  it('produces manifest.json', () => {
    expect(vfs.listFiles()).toContain('manifest.json');
  });

  it('produces at least 7 files total', () => {
    // task_graph.yaml, repo_blueprint.yaml, MPD.md, 2 tickets MD, 2 prompt packs MD + JSON variants + manifest
    expect(vfs.listFiles().length).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Schema validation of produced artifacts
// ---------------------------------------------------------------------------

describe('EmitterPipeline — artifact schema validation', () => {
  let vfs: VirtualFS;

  beforeEach(async () => {
    vfs = await runFullPipeline();
  });

  it('task_graph.yaml validates against TaskGraphSchema', () => {
    const content = vfs.readFile('task_graph.yaml');
    expect(content).toBeDefined();
    const parsed = parseYaml(content as string);
    const result = TaskGraphSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('repo_blueprint.yaml validates against RepoBlueprintSchema', () => {
    const content = vfs.readFile('repo_blueprint.yaml');
    expect(content).toBeDefined();
    const parsed = parseYaml(content as string);
    const result = RepoBlueprintSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('manifest.json validates against ManifestSchema', () => {
    const content = vfs.readFile('manifest.json');
    expect(content).toBeDefined();
    const parsed = JSON.parse(content as string);
    const result = ManifestSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('ticket JSON files validate against TicketSchema', () => {
    for (const taskId of ['TASK-001', 'TASK-002']) {
      const content = vfs.readFile(`tickets/${taskId}.json`);
      expect(content).toBeDefined();
      const parsed = JSON.parse(content as string);
      const result = TicketSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    }
  });

  it('prompt pack JSON files validate against AiPromptPackSchema', () => {
    for (const taskId of ['TASK-001', 'TASK-002']) {
      const content = vfs.readFile(`ai_prompt_pack/${taskId}.json`);
      expect(content).toBeDefined();
      const parsed = JSON.parse(content as string);
      const result = AiPromptPackSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: Manifest integrity
// ---------------------------------------------------------------------------

describe('EmitterPipeline — manifest integrity', () => {
  let vfs: VirtualFS;

  beforeEach(async () => {
    vfs = await runFullPipeline();
  });

  it('manifest references all other produced files', () => {
    const manifestContent = vfs.readFile('manifest.json') as string;
    const manifest = JSON.parse(manifestContent);
    const manifestPaths = new Set((manifest.files as Array<{ path: string }>).map(f => f.path));

    const allFiles = vfs.listFiles();
    for (const file of allFiles) {
      expect(manifestPaths.has(file)).toBe(true);
    }
  });

  it('manifest.json contains correct project metadata', () => {
    const content = vfs.readFile('manifest.json') as string;
    const manifest = JSON.parse(content);
    expect(manifest.projectName).toBe(PROJECT_NAME);
    expect(manifest.totalTasks).toBe(2);
    expect(manifest.totalCostUsd).toBe(1.23);
    expect(manifest.durationMs).toBe(4567);
    expect(manifest.atsfVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('manifest files have sha256 checksums', () => {
    const content = vfs.readFile('manifest.json') as string;
    const manifest = JSON.parse(content);
    for (const file of manifest.files as Array<{ checksum: string }>) {
      expect(file.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('manifest files have positive byte sizes', () => {
    const content = vfs.readFile('manifest.json') as string;
    const manifest = JSON.parse(content);
    for (const file of manifest.files as Array<{ sizeBytes: number }>) {
      expect(file.sizeBytes).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: Content correctness
// ---------------------------------------------------------------------------

describe('EmitterPipeline — content correctness', () => {
  let vfs: VirtualFS;

  beforeEach(async () => {
    vfs = await runFullPipeline();
  });

  it('task_graph.yaml contains both task IDs', () => {
    const content = vfs.readFile('task_graph.yaml') as string;
    expect(content).toContain('TASK-001');
    expect(content).toContain('TASK-002');
  });

  it('task_graph.yaml contains project name', () => {
    const content = vfs.readFile('task_graph.yaml') as string;
    expect(content).toContain(PROJECT_NAME);
  });

  it('MPD.md is a non-empty Markdown document', () => {
    const content = vfs.readFile('MPD.md') as string;
    expect(content.length).toBeGreaterThan(100);
    // Should contain Markdown headings
    expect(content).toContain('#');
  });

  it('ticket Markdown files contain YAML frontmatter', () => {
    const content = vfs.readFile('tickets/TASK-001.md') as string;
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('id: TASK-001');
  });

  it('prompt pack Markdown files contain task ID and context', () => {
    const content = vfs.readFile('ai_prompt_pack/TASK-001.md') as string;
    expect(content).toContain('TASK-001');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: Determinism
// ---------------------------------------------------------------------------

describe('EmitterPipeline — determinism', () => {
  it('produces identical task_graph.yaml on two successive runs with same input', async () => {
    const ctx1 = buildEmitterContext();
    const ctx2 = buildEmitterContext();
    // Force same timestamp to ensure determinism
    (ctx1 as Record<string, unknown>).generatedAt = GENERATED_AT;
    (ctx2 as Record<string, unknown>).generatedAt = GENERATED_AT;

    const pipeline = new EmitterPipeline([new TaskGraphEmitter()]);
    await pipeline.run(ctx1);
    await pipeline.run(ctx2);

    const content1 = ctx1.vfs.readFile('task_graph.yaml');
    const content2 = ctx2.vfs.readFile('task_graph.yaml');

    expect(content1).toBe(content2);
  });

  it('produces identical manifest.json on two successive runs', async () => {
    const ctx1 = buildEmitterContext();
    const ctx2 = buildEmitterContext();
    (ctx1 as Record<string, unknown>).generatedAt = GENERATED_AT;
    (ctx2 as Record<string, unknown>).generatedAt = GENERATED_AT;

    const pipeline = new EmitterPipeline([
      new TaskGraphEmitter(),
      new ManifestEmitter(),
    ]);
    await pipeline.run(ctx1);
    await pipeline.run(ctx2);

    const content1 = ctx1.vfs.readFile('manifest.json');
    const content2 = ctx2.vfs.readFile('manifest.json');

    expect(content1).toBe(content2);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: Empty pipeline
// ---------------------------------------------------------------------------

describe('EmitterPipeline — edge cases', () => {
  it('empty emitter list produces no files', async () => {
    const ctx = buildEmitterContext();
    const pipeline = new EmitterPipeline([]);
    await pipeline.run(ctx);
    expect(ctx.vfs.listFiles()).toHaveLength(0);
  });

  it('single emitter produces only its files', async () => {
    const ctx = buildEmitterContext();
    const pipeline = new EmitterPipeline([new TaskGraphEmitter()]);
    await pipeline.run(ctx);
    const files = ctx.vfs.listFiles();
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('task_graph.yaml');
  });
});
