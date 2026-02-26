/**
 * Counting semaphore for concurrency control (spec Section 9.4.3).
 *
 * Used by AdaptiveConcurrencyController to limit concurrent provider calls,
 * and by GateContext.llmSemaphore to limit concurrent LLM calls across gates.
 */
export class Semaphore {
  private _max: number;
  private _held: number = 0;
  private readonly _queue: Array<() => void> = [];

  constructor(max: number) {
    if (max < 1) {
      throw new RangeError(`Semaphore max permits must be >= 1, got ${max}`);
    }
    this._max = max;
  }

  /** Current number of available permits. */
  get available(): number {
    return Math.max(0, this._max - this._held);
  }

  /**
   * Acquire a permit. Resolves when a permit is available.
   */
  acquire(): Promise<void> {
    if (this._held < this._max) {
      this._held++;
      return Promise.resolve();
    }

    // Block until a permit becomes available
    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  /**
   * Release a permit, waking the next waiter in FIFO order.
   */
  release(): void {
    this._held--;
    this._drainQueue();
  }

  /**
   * Dynamically adjust the maximum number of permits.
   * - Increasing: resolves queued waiters in FIFO order for newly available permits.
   * - Decreasing: does NOT revoke held permits; excess drains naturally as holders release.
   * - Throws if max < 1.
   */
  setMaxPermits(max: number): void {
    if (max < 1) {
      throw new RangeError(`Semaphore max permits must be >= 1, got ${max}`);
    }
    this._max = max;
    // If max increased, drain queue for newly available slots
    this._drainQueue();
  }

  private _drainQueue(): void {
    while (this._queue.length > 0 && this._held < this._max) {
      const resolve = this._queue.shift()!;
      this._held++;
      resolve();
    }
  }
}
