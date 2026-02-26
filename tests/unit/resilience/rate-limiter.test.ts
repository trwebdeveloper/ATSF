import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../../../src/resilience/rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a rate limiter with specified capacity', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 1 });
    expect(limiter.available).toBe(10);
  });

  it('consume() reduces available tokens', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 1 });
    await limiter.consume(3);
    expect(limiter.available).toBe(7);
  });

  it('consume() blocks when not enough tokens', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillRate: 1 });
    await limiter.consume(2);
    expect(limiter.available).toBe(0);

    let resolved = false;
    const p = limiter.consume(1).then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);

    // Advance time to refill 1 token
    vi.advanceTimersByTime(1000);
    await p;
    expect(resolved).toBe(true);
  });

  it('refills tokens at refillRate per second', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 2 });
    await limiter.consume(10);
    expect(limiter.available).toBe(0);

    vi.advanceTimersByTime(1000); // +2 tokens
    await Promise.resolve();
    expect(limiter.available).toBe(2);
  });

  it('does not exceed capacity on refill', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillRate: 2 });
    vi.advanceTimersByTime(5000); // Would add 10 tokens but cap is 5
    await Promise.resolve();
    expect(limiter.available).toBe(5);
  });

  it('waitTime() returns 0 when tokens available', () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 10, refillRate: 1 });
    expect(limiter.waitTime(5)).toBe(0);
  });

  it('waitTime() returns positive ms when tokens unavailable', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillRate: 1 });
    await limiter.consume(2);
    const wait = limiter.waitTime(1);
    expect(wait).toBeGreaterThan(0);
  });
});
