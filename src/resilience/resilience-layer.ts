import { BudgetExceededError } from '../shared/errors.js';
import type { EventBus } from '../events/types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { AdaptiveConcurrencyController } from './adaptive-concurrency.js';
import { TokenBucketRateLimiter } from './rate-limiter.js';
import { CostTracker } from './cost-tracker.js';
import type { ResilienceResult, ProviderResilienceConfig, ResilienceConfig } from './types.js';
import type { CostRecord } from './cost-tracker.js';

/**
 * ResilienceLayer facade composing circuit breaker, rate limiter, semaphore,
 * and cost tracker into a single execute() pipeline (spec Section 9.4.1).
 *
 * Execute pipeline:
 *   cost check -> circuit breaker -> rate limiter -> semaphore -> fn()
 */
export class ResilienceLayer {
  private readonly _circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly _concurrencyControllers = new Map<string, AdaptiveConcurrencyController>();
  private readonly _rateLimiters = new Map<string, TokenBucketRateLimiter>();
  private readonly _costTracker: CostTracker;
  private readonly _eventBus?: EventBus;
  private readonly _config: ResilienceConfig;

  constructor(config: ResilienceConfig = {}, eventBus?: EventBus) {
    this._config = config;
    this._costTracker = new CostTracker(config.budget ?? {});
    this._eventBus = eventBus;

    // Pre-register any providers specified in config
    if (config.providers) {
      for (const [provider, providerConfig] of Object.entries(config.providers)) {
        this.registerProvider(provider, providerConfig);
      }
    }
  }

  /** Access the cost tracker for budget inspection. */
  get costTracker(): CostTracker {
    return this._costTracker;
  }

  /** Register a provider with its resilience config. */
  registerProvider(provider: string, config: ProviderResilienceConfig): void {
    if (!this._circuitBreakers.has(provider)) {
      this._circuitBreakers.set(
        provider,
        new CircuitBreaker(
          provider,
          config.circuitBreaker ?? this._config.defaultCircuitBreaker,
        ),
      );
    }

    if (!this._concurrencyControllers.has(provider)) {
      this._concurrencyControllers.set(
        provider,
        new AdaptiveConcurrencyController(
          config.adaptiveConcurrency ?? this._config.defaultAdaptiveConcurrency,
        ),
      );
    }

    if (config.rateLimiter && !this._rateLimiters.has(provider)) {
      this._rateLimiters.set(provider, new TokenBucketRateLimiter(config.rateLimiter));
    } else if (
      this._config.defaultRateLimiter &&
      !this._rateLimiters.has(provider)
    ) {
      this._rateLimiters.set(
        provider,
        new TokenBucketRateLimiter(this._config.defaultRateLimiter),
      );
    }
  }

  /** Get circuit state for a provider. */
  getCircuitState(provider: string): 'closed' | 'open' | 'half-open' {
    this._ensureProvider(provider);
    return this._circuitBreakers.get(provider)!.state;
  }

  /** Get current concurrency limit for a provider. */
  getConcurrencyLimit(provider: string): number {
    this._ensureProvider(provider);
    return this._concurrencyControllers.get(provider)!.currentLimit;
  }

  /**
   * Execute a provider call through the full resilience pipeline:
   * cost check -> circuit breaker -> rate limiter -> semaphore -> fn()
   *
   * On success: records cost, records latency for adaptive controller.
   * On transient failure: records failure for circuit breaker, records error for adaptive controller.
   * On BudgetExceededError: propagates immediately, does NOT affect circuit breaker state.
   */
  async execute<T>(
    provider: string,
    fn: () => Promise<ResilienceResult<T>>,
    signal?: AbortSignal,
  ): Promise<T> {
    this._ensureProvider(provider);

    // Step 1: cost check (pre-call)
    this._costTracker.check();

    const circuitBreaker = this._circuitBreakers.get(provider)!;
    const controller = this._concurrencyControllers.get(provider)!;
    const rateLimiter = this._rateLimiters.get(provider);

    // Step 2: circuit breaker check
    circuitBreaker.check();

    // Step 3: rate limiter wait
    if (rateLimiter) {
      await rateLimiter.consume(1);
    }

    // Step 4: semaphore acquire
    const semaphore = controller.semaphore;
    await semaphore.acquire();

    const startMs = Date.now();
    try {
      // Check if aborted before calling
      if (signal?.aborted) {
        throw new Error('AbortSignal: operation was aborted');
      }

      const result = await fn();
      const latencyMs = Date.now() - startMs;

      // Record success
      circuitBreaker.recordSuccess();
      controller.recordLatency(latencyMs);

      // Record cost synchronously on success path
      const costRecord: CostRecord = {
        provider,
        model: 'unknown',
        promptTokens: result.tokenUsage.promptTokens,
        completionTokens: result.tokenUsage.completionTokens,
        totalTokens: result.tokenUsage.totalTokens,
        costUsd: 0, // Callers pre-compute cost in ResilienceResult if desired
        timestamp: new Date(),
      };
      this._costTracker.record(costRecord);

      return result.value;
    } catch (err) {
      // BudgetExceededError is fatal and non-retryable; do NOT record circuit breaker failure
      if (err instanceof BudgetExceededError) {
        throw err;
      }

      // Transient provider error: record failure for circuit breaker
      circuitBreaker.recordFailure();
      controller.recordError();

      this._emitCircuitEvent(provider, circuitBreaker.state);

      throw err;
    } finally {
      semaphore.release();
    }
  }

  /** Shut down all adaptive controllers and clean up timers. */
  shutdown(): void {
    for (const controller of this._concurrencyControllers.values()) {
      controller.shutdown();
    }
  }

  private _ensureProvider(provider: string): void {
    if (!this._circuitBreakers.has(provider)) {
      this.registerProvider(provider, {});
    }
  }

  private _emitCircuitEvent(provider: string, state: 'closed' | 'open' | 'half-open'): void {
    if (!this._eventBus) return;
    const now = new Date();
    if (state === 'open') {
      this._eventBus.emit({
        type: 'resilience.circuit.opened',
        provider,
        failureCount: 0, // CB doesn't expose this publicly; fire event only
        cooldownMs: 30_000,
        timestamp: now,
        source: 'resilience-layer',
      });
    } else if (state === 'half-open') {
      this._eventBus.emit({
        type: 'resilience.circuit.halfOpen',
        provider,
        timestamp: now,
        source: 'resilience-layer',
      });
    } else if (state === 'closed') {
      this._eventBus.emit({
        type: 'resilience.circuit.closed',
        provider,
        timestamp: now,
        source: 'resilience-layer',
      });
    }
  }
}
