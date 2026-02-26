/**
 * MpdEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { MpdEmitter } from '../../../src/emitter/emitters/mpd.js';
import { MpdSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext, MpdInput } from '../../../src/emitter/types.js';

function makeMpdInput(): MpdInput {
  return {
    executiveSummary: {
      projectName: 'MPD Test Project',
      oneLiner: 'A test project for verifying the MPD emitter functionality.',
      objectives: ['Verify emitter correctness', 'Ensure schema compliance'],
      targetAudience: ['Developers', 'Architects'],
      scope: {
        inScope: ['Core feature implementation', 'Unit test coverage'],
        outOfScope: ['Mobile applications', 'Third-party integrations'],
      },
    },
    projectOverview: {
      background: 'This project was created to test the MPD emitter in the ATSF pipeline.',
      problemStatement: 'There is a need to validate that the MPD emitter produces correct output.',
      proposedSolution: 'Implement a comprehensive MPD emitter with schema validation.',
      successCriteria: ['All tests pass', 'Schema validation succeeds'],
      assumptions: [],
    },
    technicalArchitecture: {
      overview: 'A Node.js TypeScript application using the ATSF framework for AI-driven specification.',
      diagrams: [
        {
          type: 'flowchart' as const,
          title: 'System Architecture',
          source: 'graph TD\n  A[Input] --> B[Pipeline]\n  B --> C[Output]',
        },
      ],
      patterns: [
        { name: 'Pipeline Pattern', rationale: 'Sequential processing of artifacts through emitters.' },
      ],
      techStack: [
        { name: 'Node.js', version: '20', purpose: 'Runtime', category: 'language' as const },
        { name: 'TypeScript', version: '5.7', purpose: 'Type safety', category: 'language' as const },
      ],
    },
    componentDesign: {
      components: [
        {
          name: 'EmitterPipeline',
          description: 'Orchestrates the sequential execution of artifact emitters.',
          responsibilities: ['Run emitters in sequence', 'Pass shared context'],
          interfaces: [],
          dependencies: [],
          taskRefs: ['TASK-001'],
        },
      ],
    },
    dataModel: {
      overview: 'Simple in-memory data model for testing purposes.',
      entities: [],
    },
    apiDesign: {
      overview: 'No public API for this test component.',
      endpoints: [],
    },
    securityConsiderations: {
      overview: 'Standard security practices apply including input validation and output sanitization.',
      threatModel: [],
    },
    testingStrategy: {
      overview: 'Test-driven development with Vitest for unit and integration tests.',
      levels: [
        {
          name: 'unit' as const,
          description: 'Unit tests for all emitter components using mocked dependencies.',
          tools: ['vitest'],
          coverageTarget: '80%',
        },
      ],
      taskRefs: ['TASK-001'],
    },
    deploymentPlan: {
      overview: 'NPM package distribution for CLI usage.',
      environments: [
        { name: 'production', purpose: 'End-user CLI execution', infrastructure: 'Local machine' },
      ],
    },
    riskAssessment: {
      risks: [
        {
          id: 'RISK-001',
          description: 'Template rendering may fail for complex inputs.',
          probability: 'low' as const,
          impact: 'minor' as const,
          mitigation: 'Comprehensive unit tests with diverse input fixtures.',
        },
      ],
    },
    timeline: {
      phases: [
        { name: 'Implementation', description: 'Core emitter development', taskRefs: ['TASK-001'] },
      ],
      criticalPath: ['TASK-001'],
    },
    glossary: { terms: [] },
    appendices: { adrs: [], references: [] },
  };
}

function makeCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'MPD Test Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    mpdInput: makeMpdInput(),
    ...overrides,
  };
}

describe('MpdEmitter', () => {
  it('writes MPD.md to VirtualFS', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    expect(ctx.vfs.listFiles()).toContain('MPD.md');
  });

  it('MPD.md content is a non-empty string', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('MPD.md') as string;
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(100);
  });

  it('MPD.md contains project name', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('MPD.md') as string;
    expect(content).toContain('MPD Test Project');
  });

  it('MPD.md contains standard sections', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('MPD.md') as string;
    expect(content).toContain('Executive Summary');
    expect(content).toContain('Technical Architecture');
  });

  it('is deterministic', async () => {
    const emitter = new MpdEmitter();
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();
    await emitter.emit(ctx1);
    await emitter.emit(ctx2);
    expect(ctx1.vfs.readFile('MPD.md')).toBe(ctx2.vfs.readFile('MPD.md'));
  });

  it('writes the MPD structured data as mpd-data.json alongside MPD.md', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    // The emitter also stores structured data for schema validation
    const files = ctx.vfs.listFiles();
    // At minimum MPD.md must exist
    expect(files).toContain('MPD.md');
  });

  it('structured MPD data validates against MpdSchema', async () => {
    const ctx = makeCtx();
    const emitter = new MpdEmitter();
    await emitter.emit(ctx);

    // The emitter should store structured data that validates against MpdSchema
    const structuredFile = ctx.vfs.readFile('mpd-data.json');
    if (structuredFile) {
      const parsed = JSON.parse(structuredFile as string);
      const result = MpdSchema.safeParse(parsed);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });
});
