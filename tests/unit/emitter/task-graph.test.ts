/**
 * TaskGraphEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { TaskGraphEmitter } from '../../../src/emitter/emitters/task-graph.js';
import { TaskGraphSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext } from '../../../src/emitter/types.js';

function makeTaskGraphCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'Test Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    lang: 'en',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    taskGraphInput: {
      project: {
        name: 'Test Project',
        description: 'A test project for unit testing the emitter pipeline.',
        constraints: [],
      },
      tasks: [
        {
          id: 'TASK-001',
          name: 'Setup database schema',
          description: 'Define and create the initial database schema for the project.',
          agent: 'planner' as const,
          type: 'architecture' as const,
          dependsOn: [],
          filesWrite: ['docs/schema.yaml'],
          filesRead: [],
          priority: 5,
          acceptanceCriteria: [{ description: 'Schema file is created with all tables defined', testable: true }],
          tags: [],
        },
      ],
    },
    ...overrides,
  };
}

describe('TaskGraphEmitter', () => {
  it('writes task_graph.yaml to the VirtualFS', async () => {
    const ctx = makeTaskGraphCtx();
    const emitter = new TaskGraphEmitter();
    await emitter.emit(ctx);

    const files = ctx.vfs.listFiles();
    expect(files).toContain('task_graph.yaml');
  });

  it('produces output that validates against TaskGraphSchema', async () => {
    const ctx = makeTaskGraphCtx();
    const emitter = new TaskGraphEmitter();
    await emitter.emit(ctx);

    const yamlContent = ctx.vfs.readFile('task_graph.yaml') as string;
    const parsed = parse(yamlContent);
    const result = TaskGraphSchema.safeParse(parsed);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('includes correct project name', async () => {
    const ctx = makeTaskGraphCtx();
    const emitter = new TaskGraphEmitter();
    await emitter.emit(ctx);

    const yamlContent = ctx.vfs.readFile('task_graph.yaml') as string;
    const parsed = parse(yamlContent);
    expect(parsed.project.name).toBe('Test Project');
  });

  it('is deterministic: same input produces same YAML', async () => {
    const emitter = new TaskGraphEmitter();

    const ctx1 = makeTaskGraphCtx();
    await emitter.emit(ctx1);

    const ctx2 = makeTaskGraphCtx();
    await emitter.emit(ctx2);

    expect(ctx1.vfs.readFile('task_graph.yaml')).toBe(ctx2.vfs.readFile('task_graph.yaml'));
  });

  it('YAML keys are sorted (deterministic key ordering)', async () => {
    const ctx = makeTaskGraphCtx();
    const emitter = new TaskGraphEmitter();
    await emitter.emit(ctx);

    const yamlContent = ctx.vfs.readFile('task_graph.yaml') as string;
    // Top-level keys should appear in sorted order in the YAML output
    const checksum = yamlContent.indexOf('checksum:');
    const generated = yamlContent.indexOf('generated:');
    const project = yamlContent.indexOf('project:');
    const tasks = yamlContent.indexOf('tasks:');
    const version = yamlContent.indexOf('version:');

    // sorted: checksum, generated, project, tasks, version
    expect(checksum).toBeLessThan(generated);
    expect(generated).toBeLessThan(project);
    expect(project).toBeLessThan(tasks);
    expect(tasks).toBeLessThan(version);
  });

  it('includes a valid sha256 checksum', async () => {
    const ctx = makeTaskGraphCtx();
    const emitter = new TaskGraphEmitter();
    await emitter.emit(ctx);

    const yamlContent = ctx.vfs.readFile('task_graph.yaml') as string;
    const parsed = parse(yamlContent);
    expect(parsed.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
