import type { TokenUsage } from '../shared/types.js';

/**
 * The result of a resilience-wrapped provider call.
 * The `execute()` method unwraps this, returning only `T` to the caller.
 */
export interface ResilienceResult<T> {
  readonly value: T;
  readonly tokenUsage: TokenUsage;
  readonly latencyMs: number;
}

/**
 * Configuration for the circuit breaker.
 */
export interface CircuitBreakerConfig {
  readonly failureThreshold?: number;   // default: 5
  readonly cooldownMs?: number;         // default: 30000
  readonly halfOpenMaxAttempts?: number; // default: 1
}

/**
 * Configuration for token bucket rate limiter.
 */
export interface RateLimiterConfig {
  readonly capacity: number;     // max burst tokens
  readonly refillRate: number;   // tokens per second
}

/**
 * Per-provider adaptive concurrency configuration.
 */
export interface AdaptiveConcurrencyConfig {
  readonly initialConcurrency?: number;   // default: 5
  readonly minConcurrency?: number;       // default: 1
  readonly maxConcurrency?: number;       // default: 20
  readonly latencyTargetMs?: number;      // default: 5000
  readonly adjustmentInterval?: number;   // default: 10000
  readonly increaseRatio?: number;        // default: 1.1
  readonly decreaseRatio?: number;        // default: 0.7
}

/**
 * Cost budget constraints.
 */
export interface CostBudget {
  readonly perRunUsd?: number;
  readonly perDayUsd?: number;
  readonly perMonthUsd?: number;
}

/**
 * Per-provider resilience configuration combining all sub-configs.
 */
export interface ProviderResilienceConfig {
  readonly circuitBreaker?: CircuitBreakerConfig;
  readonly rateLimiter?: RateLimiterConfig;
  readonly adaptiveConcurrency?: AdaptiveConcurrencyConfig;
}

/**
 * Top-level resilience configuration.
 */
export interface ResilienceConfig {
  readonly budget?: CostBudget;
  readonly providers?: Record<string, ProviderResilienceConfig>;
  readonly defaultCircuitBreaker?: CircuitBreakerConfig;
  readonly defaultRateLimiter?: RateLimiterConfig;
  readonly defaultAdaptiveConcurrency?: AdaptiveConcurrencyConfig;
}
