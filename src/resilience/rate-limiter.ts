import type { RateLimiterConfig } from './types.js';

/**
 * Token bucket rate limiter (spec Section 9.4).
 *
 * Tokens refill at `refillRate` per second up to `capacity`.
 * consume() waits until enough tokens are available.
 */
export class TokenBucketRateLimiter {
  private readonly _capacity: number;
  private readonly _refillRate: number; // tokens per second
  private _tokens: number;
  private _lastRefill: number;
  private readonly _queue: Array<{ needed: number; resolve: () => void }> = [];
  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    this._capacity = config.capacity;
    this._refillRate = config.refillRate;
    this._tokens = config.capacity;
    this._lastRefill = Date.now();
  }

  /** Current number of available tokens (after refill). */
  get available(): number {
    this._refill();
    return this._tokens;
  }

  /**
   * Consume `count` tokens. Resolves when enough tokens are available.
   */
  consume(count: number = 1): Promise<void> {
    this._refill();
    if (this._tokens >= count) {
      this._tokens -= count;
      return Promise.resolve();
    }

    // Block until enough tokens refilled
    return new Promise<void>((resolve) => {
      this._queue.push({ needed: count, resolve });
      this._scheduleRefill();
    });
  }

  /**
   * Returns ms to wait before `count` tokens will be available.
   * Returns 0 if already enough tokens.
   */
  waitTime(count: number = 1): number {
    this._refill();
    if (this._tokens >= count) return 0;
    const deficit = count - this._tokens;
    return Math.ceil((deficit / this._refillRate) * 1000);
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = (now - this._lastRefill) / 1000; // seconds
    if (elapsed > 0) {
      this._tokens = Math.min(this._capacity, this._tokens + elapsed * this._refillRate);
      this._lastRefill = now;
    }
  }

  private _scheduleRefill(): void {
    if (this._timer !== null) return;
    // Schedule periodic refill checks
    this._timer = setInterval(() => {
      this._refill();
      this._drainQueue();
      if (this._queue.length === 0) {
        if (this._timer !== null) {
          clearInterval(this._timer);
          this._timer = null;
        }
      }
    }, Math.ceil(1000 / this._refillRate));
  }

  private _drainQueue(): void {
    while (this._queue.length > 0) {
      const front = this._queue[0]!;
      if (this._tokens >= front.needed) {
        this._queue.shift();
        this._tokens -= front.needed;
        front.resolve();
      } else {
        break;
      }
    }
  }
}
