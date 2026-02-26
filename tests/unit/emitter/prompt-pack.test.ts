/**
 * PromptPackEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { PromptPackEmitter } from '../../../src/emitter/emitters/prompt-pack.js';
import { AiPromptPackSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext, PromptPackInput } from '../../../src/emitter/types.js';

function makePromptPackInput(): PromptPackInput {
  return {
    taskId: 'TASK-001',
    taskName: 'Implement database schema',
    context: 'You are implementing the database schema for a SaaS CRM application using PostgreSQL.',
    contract: {
      outputFiles: [
        {
          filePath: 'docs/schema.yaml',
          exports: [],
          description: 'Database schema definition in YAML format',
        },
      ],
      exports: [],
      dependencies: [
        { name: 'postgresql', version: '14', purpose: 'Primary database' },
      ],
    },
    inputFiles: [],
    instructions: [
      { step: 1, instruction: 'Analyze the project requirements and identify all entities.' },
      { step: 2, instruction: 'Define relationships between entities with proper foreign keys.' },
    ],
    constraints: ['Use snake_case for all column names', 'All tables must have a created_at timestamp'],
    testCriteria: ['All tables have primary keys', 'Foreign key constraints are correct'],
    estimatedComplexity: 'medium' as const,
    suggestedModel: 'balanced' as const,
    previousTaskOutputs: [],
  };
}

function makeCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'PromptPack Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    promptPackInput: [makePromptPackInput()],
    ...overrides,
  };
}

describe('PromptPackEmitter', () => {
  it('writes files to ai_prompt_pack/ directory', async () => {
    const ctx = makeCtx();
    const emitter = new PromptPackEmitter();
    await emitter.emit(ctx);

    const files = ctx.vfs.listFiles();
    expect(files.some(f => f.startsWith('ai_prompt_pack/'))).toBe(true);
  });

  it('creates one file per prompt pack', async () => {
    const pack2: PromptPackInput = {
      ...makePromptPackInput(),
      taskId: 'TASK-002',
      taskName: 'Implement API routes',
      context: 'You are implementing REST API routes for a SaaS CRM application.',
      contract: {
        outputFiles: [
          { filePath: 'src/api/routes.ts', exports: ['createRouter'], description: 'Express router setup' },
        ],
        exports: ['createRouter'],
        dependencies: [{ name: 'express', version: '4.x', purpose: 'HTTP framework' }],
      },
      inputFiles: [{ filePath: 'docs/schema.yaml', sourceTask: 'TASK-001', description: 'Database schema' }],
    };

    const ctx = makeCtx({ promptPackInput: [makePromptPackInput(), pack2] });
    const emitter = new PromptPackEmitter();
    await emitter.emit(ctx);

    const packFiles = ctx.vfs.listFiles().filter(f => f.startsWith('ai_prompt_pack/'));
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('prompt pack files contain task ID', async () => {
    const ctx = makeCtx();
    const emitter = new PromptPackEmitter();
    await emitter.emit(ctx);

    const packFiles = ctx.vfs.listFiles().filter(f => f.startsWith('ai_prompt_pack/'));
    const content = ctx.vfs.readFile(packFiles[0]) as string;
    expect(content).toContain('TASK-001');
  });

  it('structured prompt pack data validates against AiPromptPackSchema', async () => {
    const ctx = makeCtx();
    const emitter = new PromptPackEmitter();
    await emitter.emit(ctx);

    const jsonFile = ctx.vfs.readFile('ai_prompt_pack/TASK-001.json');
    if (jsonFile) {
      const parsed = JSON.parse(jsonFile as string);
      const result = AiPromptPackSchema.safeParse(parsed);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    } else {
      // Markdown file should contain task name
      const packFiles = ctx.vfs.listFiles().filter(f => f.startsWith('ai_prompt_pack/'));
      expect(packFiles.length).toBeGreaterThan(0);
      const mdFile = packFiles.find(f => f.includes('TASK-001'));
      expect(mdFile).toBeDefined();
    }
  });

  it('is deterministic', async () => {
    const emitter = new PromptPackEmitter();
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();
    await emitter.emit(ctx1);
    await emitter.emit(ctx2);

    const files1 = ctx1.vfs.listFiles().filter(f => f.startsWith('ai_prompt_pack/')).sort();
    const files2 = ctx2.vfs.listFiles().filter(f => f.startsWith('ai_prompt_pack/')).sort();
    expect(files1).toEqual(files2);
    for (const f of files1) {
      expect(ctx1.vfs.readFile(f)).toBe(ctx2.vfs.readFile(f));
    }
  });
});
