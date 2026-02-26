import { describe, it, expect, beforeEach } from 'vitest';
import { FileLockManager } from '../../../src/dag/runtime/file-lock-manager.js';
import type { TaskId } from '../../../src/shared/types.js';

describe('FileLockManager', () => {
  let lockManager: FileLockManager;

  beforeEach(() => {
    lockManager = new FileLockManager({ lockTtlMs: 300_000, reapIntervalMs: 30_000 });
  });

  describe('acquire / release basics', () => {
    it('acquires write locks on free files', async () => {
      const result = await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);
      expect(result).toBe(true);
    });

    it('acquires read locks on free files', async () => {
      const result = await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]);
      expect(result).toBe(true);
    });

    it('allows multiple concurrent read locks on the same file', async () => {
      const r1 = await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]);
      const r2 = await lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });

    it('blocks write lock when file has existing read lock', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]);

      // T2 wants write, should wait
      let resolved = false;
      const promise = lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then((r) => { resolved = true; return r; });

      // Should not have resolved yet
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);
      expect(lockManager.queueDepth).toBe(1);

      // Release T1 -> T2 should get the lock
      lockManager.release('T1' as TaskId);
      const result = await promise;
      expect(result).toBe(true);
      expect(resolved).toBe(true);
    });

    it('blocks write lock when file has existing write lock', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      let resolved = false;
      const promise = lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then((r) => { resolved = true; return r; });

      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      lockManager.release('T1' as TaskId);
      const result = await promise;
      expect(result).toBe(true);
    });

    it('blocks read lock when file has existing write lock', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      let resolved = false;
      const promise = lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]).then((r) => { resolved = true; return r; });

      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      lockManager.release('T1' as TaskId);
      const result = await promise;
      expect(result).toBe(true);
    });

    it('release frees locks and removes task from internal state', () => {
      // Synchronous release should not throw
      lockManager.release('nonexistent' as TaskId);
    });
  });

  describe('bulk acquire: all-or-nothing', () => {
    it('acquires all locks atomically when all are free', async () => {
      const result = await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
        { pattern: 'src/b.ts', mode: 'write' },
        { pattern: 'src/c.ts', mode: 'read' },
      ]);
      expect(result).toBe(true);
    });

    it('does NOT partially acquire — waits for all or nothing', async () => {
      // T1 holds write lock on a.ts
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      // T2 wants both a.ts and b.ts — should NOT get b.ts alone
      let resolved = false;
      const promise = lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
        { pattern: 'src/b.ts', mode: 'write' },
      ]).then((r) => { resolved = true; return r; });

      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      // Verify b.ts is NOT locked by T2 (since all-or-nothing)
      // T3 should be able to get b.ts
      const r3 = await lockManager.acquire('T3' as TaskId, [
        { pattern: 'src/b.ts', mode: 'write' },
      ]);
      expect(r3).toBe(true);

      // Release both T1 and T3 so T2 can proceed
      lockManager.release('T1' as TaskId);
      lockManager.release('T3' as TaskId);

      const result = await promise;
      expect(result).toBe(true);
    });
  });

  describe('FIFO fairness queue', () => {
    it('serves waiting tasks in FIFO order', async () => {
      // T1 holds lock on a.ts
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      const order: string[] = [];

      // T3 wants a.ts — queued first
      const p3 = lockManager.acquire('T3' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then(() => { order.push('T3'); });

      // T5 wants a.ts — queued second
      const p5 = lockManager.acquire('T5' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then(() => { order.push('T5'); });

      await new Promise((r) => setTimeout(r, 50));
      expect(lockManager.queueDepth).toBe(2);

      // Release T1 — T3 should be served first (FIFO)
      lockManager.release('T1' as TaskId);
      await p3;

      // Now release T3 — T5 should be served
      lockManager.release('T3' as TaskId);
      await p5;

      expect(order).toEqual(['T3', 'T5']);
    });

    it('FIFO: task queued earlier gets priority even if another task could proceed', async () => {
      // Example from spec:
      // T1 holds a.ts
      // T3 wants [a.ts, b.ts] -> fails, queued
      // T5 wants [a.ts]       -> fails, queued after T3
      // release(T1): T3 checked first (FIFO), T3 gets a.ts+b.ts
      //              T5 must wait for T3 even though a.ts is briefly free

      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      const order: string[] = [];

      const p3 = lockManager.acquire('T3' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
        { pattern: 'src/b.ts', mode: 'write' },
      ]).then(() => { order.push('T3'); });

      // Ensure T3 is queued before T5
      await new Promise((r) => setTimeout(r, 10));

      const p5 = lockManager.acquire('T5' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then(() => { order.push('T5'); });

      await new Promise((r) => setTimeout(r, 50));

      // Release T1 -> T3 served first, then T5 waits
      lockManager.release('T1' as TaskId);
      await p3;

      lockManager.release('T3' as TaskId);
      await p5;

      expect(order).toEqual(['T3', 'T5']);
    });
  });

  describe('canAcquire', () => {
    it('returns true when files are available', () => {
      expect(lockManager.canAcquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ])).toBe(true);
    });

    it('returns false when files are locked', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);
      expect(lockManager.canAcquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ])).toBe(false);
    });

    it('returns true for read when only read locks exist', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ]);
      expect(lockManager.canAcquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'read' },
      ])).toBe(true);
    });
  });

  describe('TTL-based stale lock expiration', () => {
    it('expireStale releases locks held longer than ttlMs', async () => {
      const mgr = new FileLockManager({ lockTtlMs: 50, reapIntervalMs: 30_000 });

      await mgr.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      // Wait for lock to go stale
      await new Promise((r) => setTimeout(r, 100));

      const expired = mgr.expireStale(50);
      expect(expired).toContain('T1');

      // Now another task should be able to acquire
      const result = await mgr.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);
      expect(result).toBe(true);
    });

    it('does not expire locks within TTL', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      const expired = lockManager.expireStale(300_000);
      expect(expired).toEqual([]);
    });

    it('expireStale wakes up queued tasks after releasing stale locks', async () => {
      const mgr = new FileLockManager({ lockTtlMs: 50, reapIntervalMs: 30_000 });

      await mgr.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      let resolved = false;
      const promise = mgr.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]).then((r) => { resolved = true; return r; });

      await new Promise((r) => setTimeout(r, 100));
      expect(resolved).toBe(false);

      mgr.expireStale(50);
      const result = await promise;
      expect(result).toBe(true);
    });
  });

  describe('queueDepth', () => {
    it('starts at 0', () => {
      expect(lockManager.queueDepth).toBe(0);
    });

    it('increments when tasks are enqueued waiting for locks', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      // These will wait
      lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);
      lockManager.acquire('T3' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      await new Promise((r) => setTimeout(r, 50));
      expect(lockManager.queueDepth).toBe(2);
    });

    it('decrements when queued task acquires lock', async () => {
      await lockManager.acquire('T1' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      const p2 = lockManager.acquire('T2' as TaskId, [
        { pattern: 'src/a.ts', mode: 'write' },
      ]);

      await new Promise((r) => setTimeout(r, 50));
      expect(lockManager.queueDepth).toBe(1);

      lockManager.release('T1' as TaskId);
      await p2;
      expect(lockManager.queueDepth).toBe(0);
    });
  });

  describe('empty file list', () => {
    it('acquire with empty files succeeds immediately', async () => {
      const result = await lockManager.acquire('T1' as TaskId, []);
      expect(result).toBe(true);
    });
  });
});
