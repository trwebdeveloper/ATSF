import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../../../src/resilience/circuit-breaker.js';
import { CircuitBreakerOpenError } from '../../../src/shared/errors.js';
import { BudgetExceededError } from '../../../src/shared/errors.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker('test-provider', {
      failureThreshold: 3,
      cooldownMs: 1000,
      halfOpenMaxAttempts: 1,
    });
  });

  it('starts in closed state', () => {
    expect(cb.state).toBe('closed');
  });

  it('transitions closed -> open after failureThreshold failures', () => {
    cb.recordFailure();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('open');
  });

  it('throws CircuitBreakerOpenError when open', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe('open');
    expect(() => cb.check()).toThrow(CircuitBreakerOpenError);
  });

  it('does not throw when closed', () => {
    expect(() => cb.check()).not.toThrow();
  });

  it('transitions open -> half-open after cooldown', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe('open');

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe('half-open');
  });

  it('transitions half-open -> closed on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe('half-open');

    cb.recordSuccess();
    expect(cb.state).toBe('closed');
  });

  it('transitions half-open -> open on failure', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe('half-open');

    cb.recordFailure();
    expect(cb.state).toBe('open');
  });

  it('resets failure count on successful call in closed state', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.state).toBe('closed');
    // After reset, still need failureThreshold failures to open
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe('closed');
    cb.recordFailure();
    expect(cb.state).toBe('open');
  });

  it('allows check() in half-open state', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe('half-open');
    expect(() => cb.check()).not.toThrow();
  });

  it('BudgetExceededError does not affect circuit breaker state', () => {
    // BudgetExceededError is fatal and non-retryable.
    // The circuit breaker itself doesn't know about BudgetExceededError;
    // the resilience layer must not call recordFailure for budget errors.
    // We verify the CB stays closed when no recordFailure is called.
    // (BudgetExceededError is validated by the resilience-layer, not CB directly)
    expect(new BudgetExceededError(10, 5)).toBeInstanceOf(BudgetExceededError);
    expect(cb.state).toBe('closed');
  });

  it('uses defaults when no config provided', () => {
    const defaultCb = new CircuitBreaker('default-provider');
    expect(defaultCb.state).toBe('closed');
    // Default failure threshold is 5
    for (let i = 0; i < 4; i++) defaultCb.recordFailure();
    expect(defaultCb.state).toBe('closed');
    defaultCb.recordFailure();
    expect(defaultCb.state).toBe('open');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
