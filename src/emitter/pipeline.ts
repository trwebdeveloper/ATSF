/**
 * EmitterPipeline — T11
 *
 * Runs emitters sequentially in the order provided.
 * Each emitter writes to the shared VirtualFS in the context.
 * On error, execution stops immediately and the error propagates.
 */

import type { Emitter, EmitterContext, IEmitterPipeline } from './types.js';

export class EmitterPipeline implements IEmitterPipeline {
  private readonly emitters: readonly Emitter[];

  constructor(emitters: readonly Emitter[]) {
    this.emitters = emitters;
  }

  /**
   * Run all emitters in sequence.
   * Sequential order matters: later emitters may reference earlier outputs.
   */
  async run(ctx: EmitterContext): Promise<void> {
    for (const emitter of this.emitters) {
      await emitter.emit(ctx);
    }
  }
}
