import { Semaphore } from './semaphore.js';
import type { AdaptiveConcurrencyConfig } from './types.js';

const DEFAULTS = {
  initialConcurrency: 5,
  minConcurrency: 1,
  maxConcurrency: 20,
  latencyTargetMs: 5000,
  adjustmentInterval: 10_000,
  increaseRatio: 1.1,
  decreaseRatio: 0.7,
} satisfies Required<AdaptiveConcurrencyConfig>;

/**
 * AdaptiveConcurrencyController adjusts a Semaphore's max permits based on
 * observed latency and error rates (spec Section 9.4.4).
 *
 * - When latency < target: concurrency *= increaseRatio (capped at maxConcurrency)
 * - When latency >= target or errors: concurrency *= decreaseRatio (floor at minConcurrency)
 */
export class AdaptiveConcurrencyController {
  private readonly _semaphore: Semaphore;
  private _concurrency: number;
  private readonly _minConcurrency: number;
  private readonly _maxConcurrency: number;
  private readonly _latencyTargetMs: number;
  private readonly _increaseRatio: number;
  private readonly _decreaseRatio: number;
  private readonly _timer: ReturnType<typeof setInterval>;

  private _latencySamples: number[] = [];
  private _errorCount = 0;
  private _sampleCount = 0;

  constructor(config: AdaptiveConcurrencyConfig = {}) {
    this._concurrency = config.initialConcurrency ?? DEFAULTS.initialConcurrency;
    this._minConcurrency = config.minConcurrency ?? DEFAULTS.minConcurrency;
    this._maxConcurrency = config.maxConcurrency ?? DEFAULTS.maxConcurrency;
    this._latencyTargetMs = config.latencyTargetMs ?? DEFAULTS.latencyTargetMs;
    this._increaseRatio = config.increaseRatio ?? DEFAULTS.increaseRatio;
    this._decreaseRatio = config.decreaseRatio ?? DEFAULTS.decreaseRatio;

    this._semaphore = new Semaphore(this._concurrency);

    const intervalMs = config.adjustmentInterval ?? DEFAULTS.adjustmentInterval;
    this._timer = setInterval(() => this._adjust(), intervalMs);
  }

  /** The underlying semaphore controlling concurrency. */
  get semaphore(): Semaphore {
    return this._semaphore;
  }

  /** Current concurrency limit. */
  get currentLimit(): number {
    return this._concurrency;
  }

  /**
   * Record a completed call's latency (ms) for the adaptive algorithm.
   */
  recordLatency(latencyMs: number): void {
    this._latencySamples.push(latencyMs);
    this._sampleCount++;
  }

  /**
   * Record an error for the adaptive algorithm (triggers concurrency reduction).
   */
  recordError(): void {
    this._errorCount++;
  }

  /**
   * Shut down the adaptive controller's background timer.
   */
  shutdown(): void {
    clearInterval(this._timer);
  }

  private _adjust(): void {
    if (this._latencySamples.length === 0 && this._errorCount === 0) return;

    const avgLatency =
      this._latencySamples.length > 0
        ? this._latencySamples.reduce((a, b) => a + b, 0) / this._latencySamples.length
        : 0;

    const hasErrors = this._errorCount > 0;
    const latencyExceeded = avgLatency >= this._latencyTargetMs;

    if (!hasErrors && !latencyExceeded) {
      // Increase concurrency
      this._concurrency = Math.min(
        this._maxConcurrency,
        Math.round(this._concurrency * this._increaseRatio),
      );
    } else {
      // Decrease concurrency
      this._concurrency = Math.max(
        this._minConcurrency,
        Math.round(this._concurrency * this._decreaseRatio),
      );
    }

    this._semaphore.setMaxPermits(this._concurrency);

    // Reset samples for next window
    this._latencySamples = [];
    this._errorCount = 0;
  }
}
