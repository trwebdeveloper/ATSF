import { CircuitBreakerOpenError } from '../shared/errors.js';
import type { CircuitBreakerConfig } from './types.js';

type CircuitState = 'closed' | 'open' | 'half-open';

const DEFAULTS: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMaxAttempts: 1,
};

/**
 * Per-provider circuit breaker implementing the closed -> open -> half-open -> closed
 * state machine described in spec Section 9.4.2.
 */
export class CircuitBreaker {
  private readonly _failureThreshold: number;
  private readonly _cooldownMs: number;
  private readonly _halfOpenMaxAttempts: number;

  private _state: CircuitState = 'closed';
  private _failureCount = 0;
  private _openedAt: number | null = null;
  private _halfOpenAttempts = 0;

  constructor(
    public readonly provider: string,
    config: CircuitBreakerConfig = {},
  ) {
    this._failureThreshold = config.failureThreshold ?? DEFAULTS.failureThreshold;
    this._cooldownMs = config.cooldownMs ?? DEFAULTS.cooldownMs;
    this._halfOpenMaxAttempts = config.halfOpenMaxAttempts ?? DEFAULTS.halfOpenMaxAttempts;
  }

  get state(): CircuitState {
    if (this._state === 'open' && this._openedAt !== null) {
      const elapsed = Date.now() - this._openedAt;
      if (elapsed >= this._cooldownMs) {
        this._state = 'half-open';
        this._halfOpenAttempts = 0;
      }
    }
    return this._state;
  }

  /**
   * Check if the circuit allows a call to proceed.
   * Throws CircuitBreakerOpenError if state is 'open'.
   */
  check(): void {
    if (this.state === 'open') {
      throw new CircuitBreakerOpenError(this.provider, this._cooldownMs);
    }
  }

  /**
   * Record a successful call.
   * In half-open state, transitions back to closed after success.
   */
  recordSuccess(): void {
    const currentState = this.state;
    if (currentState === 'half-open') {
      this._state = 'closed';
      this._failureCount = 0;
      this._openedAt = null;
      this._halfOpenAttempts = 0;
    } else if (currentState === 'closed') {
      this._failureCount = 0;
    }
  }

  /**
   * Record a failed call (NOT for BudgetExceededError — callers must exclude that).
   * In closed state: increments failure count, trips to open at threshold.
   * In half-open state: trips back to open immediately.
   */
  recordFailure(): void {
    const currentState = this.state;
    if (currentState === 'closed') {
      this._failureCount++;
      if (this._failureCount >= this._failureThreshold) {
        this._state = 'open';
        this._openedAt = Date.now();
      }
    } else if (currentState === 'half-open') {
      this._state = 'open';
      this._openedAt = Date.now();
      this._halfOpenAttempts = 0;
    }
  }
}
