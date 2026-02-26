/**
 * RepoBlueprintEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { RepoBlueprintEmitter } from '../../../src/emitter/emitters/repo-blueprint.js';
import { RepoBlueprintSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext } from '../../../src/emitter/types.js';

function makeCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'Blueprint Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    lang: 'en',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    repoBlueprintInput: {
      projectName: 'Blueprint Project',
      root: [
        {
          name: 'src',
          type: 'dir' as const,
          purpose: 'Source code directory',
          children: [
            {
              name: 'index.ts',
              type: 'file' as const,
              purpose: 'Entry point',
              generatedBy: 'TASK-001',
              language: 'TypeScript',
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

describe('RepoBlueprintEmitter', () => {
  it('writes repo_blueprint.yaml to VirtualFS', async () => {
    const ctx = makeCtx();
    const emitter = new RepoBlueprintEmitter();
    await emitter.emit(ctx);

    expect(ctx.vfs.listFiles()).toContain('repo_blueprint.yaml');
  });

  it('produces output that validates against RepoBlueprintSchema', async () => {
    const ctx = makeCtx();
    const emitter = new RepoBlueprintEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('repo_blueprint.yaml') as string;
    const parsed = parse(content);
    const result = RepoBlueprintSchema.safeParse(parsed);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('includes correct projectName', async () => {
    const ctx = makeCtx();
    const emitter = new RepoBlueprintEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('repo_blueprint.yaml') as string;
    const parsed = parse(content);
    expect(parsed.projectName).toBe('Blueprint Project');
  });

  it('is deterministic', async () => {
    const emitter = new RepoBlueprintEmitter();
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();
    await emitter.emit(ctx1);
    await emitter.emit(ctx2);
    expect(ctx1.vfs.readFile('repo_blueprint.yaml')).toBe(ctx2.vfs.readFile('repo_blueprint.yaml'));
  });
});
