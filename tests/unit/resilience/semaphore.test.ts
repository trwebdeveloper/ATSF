import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../../src/resilience/semaphore.js';

describe('Semaphore', () => {
  it('initializes with correct available count', () => {
    const sem = new Semaphore(3);
    expect(sem.available).toBe(3);
  });

  it('acquire() decrements available', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem.available).toBe(1);
    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it('release() increments available', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.available).toBe(0);
    sem.release();
    expect(sem.available).toBe(1);
  });

  it('acquire() blocks when no permits available', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    expect(sem.available).toBe(0);

    let resolved = false;
    const p = sem.acquire().then(() => {
      resolved = true;
    });

    // Should not resolve yet
    await Promise.resolve();
    expect(resolved).toBe(false);

    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  it('release() unblocks waiters in FIFO order', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));

    // Release once: first waiter (1) gets unblocked
    sem.release();
    await p1;
    expect(order).toEqual([1]);

    // Release again: second waiter (2) gets unblocked
    sem.release();
    await p2;
    expect(order).toEqual([1, 2]);

    // Release again: third waiter (3) gets unblocked
    sem.release();
    await p3;
    expect(order).toEqual([1, 2, 3]);
  });

  describe('setMaxPermits()', () => {
    it('throws if max < 1', () => {
      const sem = new Semaphore(2);
      expect(() => sem.setMaxPermits(0)).toThrow();
      expect(() => sem.setMaxPermits(-1)).toThrow();
    });

    it('increasing max resolves queued waiters in FIFO order', async () => {
      const sem = new Semaphore(1);
      await sem.acquire(); // one held, none available

      const order: number[] = [];
      const p1 = sem.acquire().then(() => order.push(1));
      const p2 = sem.acquire().then(() => order.push(2));

      await Promise.resolve(); // let microtasks run
      expect(order).toEqual([]);

      // Increase from 1 to 3 — now 2 new permits available, both waiters unblocked
      sem.setMaxPermits(3);
      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
    });

    it('decreasing max does not revoke held permits', async () => {
      const sem = new Semaphore(3);
      await sem.acquire();
      await sem.acquire();
      await sem.acquire();
      // All 3 held, none available

      // Decrease to 1 — existing holders keep their permits
      sem.setMaxPermits(1);
      expect(sem.available).toBe(0); // still 0 available (3 held > new max of 1)

      // Release 2 — they drain naturally without freeing up new acquires
      sem.release(); // now held=2, max=1, available=0 (still over limit)
      sem.release(); // now held=1, max=1, available=0 (exactly at limit)

      // A new acquire should block since available is still 0
      let resolved = false;
      const p = sem.acquire().then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Release the last one: held=0, max=1, available=1, but waiter gets it
      sem.release();
      await p;
      expect(resolved).toBe(true);
    });

    it('can increase then decrease', async () => {
      const sem = new Semaphore(2);
      sem.setMaxPermits(5);
      expect(sem.available).toBe(5);

      sem.setMaxPermits(2);
      expect(sem.available).toBe(2);
    });
  });
});
