/**
 * ManifestEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { ManifestEmitter } from '../../../src/emitter/emitters/manifest.js';
import { ManifestSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext } from '../../../src/emitter/types.js';

function makeCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  const vfs = new VirtualFS();
  // Pre-populate VirtualFS with some files (as if prior emitters ran)
  vfs.writeFile('task_graph.yaml', 'version: "1.0"\nproject:\n  name: test\ntasks: []');
  vfs.writeFile('repo_blueprint.yaml', 'version: "1.0"\nroot: []');
  vfs.writeFile('MPD.md', '# Master Planning Document\n\nContent here.');
  vfs.writeFile('tickets/TASK-001.md', '---\nid: TASK-001\n---\n# Task');
  vfs.writeFile('ai_prompt_pack/TASK-001.md', '# Prompt Pack\n\nContent');

  return {
    projectName: 'Manifest Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    vfs,
    totalCostUsd: 0.42,
    durationMs: 15000,
    totalTasks: 5,
    ...overrides,
  };
}

describe('ManifestEmitter', () => {
  it('writes manifest.json to VirtualFS', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    expect(ctx.vfs.listFiles()).toContain('manifest.json');
  });

  it('manifest.json validates against ManifestSchema', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);
    const result = ManifestSchema.safeParse(parsed);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('manifest includes all files previously written to VirtualFS', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();

    // Get files before manifest is written
    const priorFiles = ctx.vfs.listFiles();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);

    for (const file of priorFiles) {
      const found = parsed.files.find((f: { path: string }) => f.path === file);
      expect(found, `File ${file} not found in manifest`).toBeDefined();
    }
  });

  it('manifest files include sha256 checksums', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);

    for (const file of parsed.files) {
      expect(file.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('manifest files include sizeBytes', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);

    for (const file of parsed.files) {
      expect(typeof file.sizeBytes).toBe('number');
      expect(file.sizeBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it('manifest includes correct projectName', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);
    expect(parsed.projectName).toBe('Manifest Project');
  });

  it('manifest includes totalTasks', async () => {
    const ctx = makeCtx({ totalTasks: 7 });
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);
    expect(parsed.totalTasks).toBe(7);
  });

  it('manifest includes totalCostUsd and durationMs', async () => {
    const ctx = makeCtx({ totalCostUsd: 1.23, durationMs: 9000 });
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);
    expect(parsed.totalCostUsd).toBe(1.23);
    expect(parsed.durationMs).toBe(9000);
  });

  it('each file has a correct artifactType', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);

    const validTypes = ['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack', 'manifest'];
    for (const file of parsed.files) {
      expect(validTypes).toContain(file.artifactType);
    }
  });

  it('manifest.json itself is listed in generatedFiles', async () => {
    const ctx = makeCtx();
    const emitter = new ManifestEmitter();
    await emitter.emit(ctx);

    const content = ctx.vfs.readFile('manifest.json') as string;
    const parsed = JSON.parse(content);

    const manifestEntry = parsed.files.find((f: { path: string }) => f.path === 'manifest.json');
    expect(manifestEntry).toBeDefined();
    expect(manifestEntry.artifactType).toBe('manifest');
  });

  it('is deterministic (same input → same content except manifest self-hash)', async () => {
    const emitter = new ManifestEmitter();

    // Use same vfs state for both runs
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();

    await emitter.emit(ctx1);
    await emitter.emit(ctx2);

    const m1 = JSON.parse(ctx1.vfs.readFile('manifest.json') as string);
    const m2 = JSON.parse(ctx2.vfs.readFile('manifest.json') as string);

    // These should be equal (same input data → same checksums)
    expect(m1.projectName).toBe(m2.projectName);
    expect(m1.totalTasks).toBe(m2.totalTasks);
    expect(m1.totalCostUsd).toBe(m2.totalCostUsd);
    // Files checksums for non-manifest files should be identical
    const nonManifest1 = m1.files.filter((f: { path: string }) => f.path !== 'manifest.json');
    const nonManifest2 = m2.files.filter((f: { path: string }) => f.path !== 'manifest.json');
    expect(nonManifest1).toEqual(nonManifest2);
  });
});
