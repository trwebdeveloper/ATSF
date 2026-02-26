/**
 * EmitterPipeline tests — T11
 */
import { describe, it, expect } from 'vitest';
import { EmitterPipeline } from '../../../src/emitter/pipeline.js';
import type { Emitter, EmitterContext } from '../../../src/emitter/types.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';

function makeContext(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'Test Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    ...overrides,
  };
}

describe('EmitterPipeline', () => {
  it('runs emitters in sequence', async () => {
    const order: string[] = [];

    const emitterA: Emitter = {
      name: 'a',
      emit: async (_ctx) => { order.push('a'); },
    };
    const emitterB: Emitter = {
      name: 'b',
      emit: async (_ctx) => { order.push('b'); },
    };
    const emitterC: Emitter = {
      name: 'c',
      emit: async (_ctx) => { order.push('c'); },
    };

    const pipeline = new EmitterPipeline([emitterA, emitterB, emitterC]);
    const ctx = makeContext();
    await pipeline.run(ctx);

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('passes the same context to all emitters', async () => {
    const contexts: EmitterContext[] = [];

    const e1: Emitter = {
      name: 'e1',
      emit: async (ctx) => { contexts.push(ctx); },
    };
    const e2: Emitter = {
      name: 'e2',
      emit: async (ctx) => { contexts.push(ctx); },
    };

    const pipeline = new EmitterPipeline([e1, e2]);
    const ctx = makeContext({ projectName: 'MyProject' });
    await pipeline.run(ctx);

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toBe(ctx);
    expect(contexts[1]).toBe(ctx);
  });

  it('propagates errors from emitters', async () => {
    const failing: Emitter = {
      name: 'fail',
      emit: async () => { throw new Error('emitter failed'); },
    };
    const pipeline = new EmitterPipeline([failing]);
    const ctx = makeContext();
    await expect(pipeline.run(ctx)).rejects.toThrow('emitter failed');
  });

  it('stops execution on first emitter error (does not run subsequent emitters)', async () => {
    const ran: string[] = [];
    const e1: Emitter = { name: 'e1', emit: async () => { ran.push('e1'); throw new Error('stop'); } };
    const e2: Emitter = { name: 'e2', emit: async () => { ran.push('e2'); } };

    const pipeline = new EmitterPipeline([e1, e2]);
    await expect(pipeline.run(makeContext())).rejects.toThrow('stop');
    expect(ran).toEqual(['e1']);
  });

  it('handles empty emitter list', async () => {
    const pipeline = new EmitterPipeline([]);
    await expect(pipeline.run(makeContext())).resolves.not.toThrow();
  });

  it('emitters can write to shared VirtualFS', async () => {
    const vfs = new VirtualFS();

    const writer: Emitter = {
      name: 'writer',
      emit: async (ctx) => { ctx.vfs.writeFile('output.txt', 'hello'); },
    };
    const reader: Emitter = {
      name: 'reader',
      emit: async (ctx) => {
        const content = ctx.vfs.readFile('output.txt');
        ctx.vfs.writeFile('result.txt', String(content) + ' world');
      },
    };

    const pipeline = new EmitterPipeline([writer, reader]);
    await pipeline.run(makeContext({ vfs }));

    expect(vfs.readFile('result.txt')).toBe('hello world');
  });
});
