/**
 * Contract Lock Manager — T09
 *
 * MVP-deferred: ContractLockManager is specified for future multi-version
 * contract migration scenarios. The MVP uses a single contract version
 * and does not require concurrent lock management.
 *
 * See Section 8.7 for the full interface specification.
 */

/* ------------------------------------------------------------------ */
/*  Lock entry                                                         */
/* ------------------------------------------------------------------ */

interface LockEntry {
  readonly contractId: string;
  readonly holderId: string;
  readonly acquiredAt: number;
  readonly ttlMs: number;
}

/* ------------------------------------------------------------------ */
/*  ContractLockManager interface                                      */
/* ------------------------------------------------------------------ */

export interface ContractLockManager {
  /**
   * Acquire a lock on a contract by ID.
   * Returns true if acquired, false if already locked by another holder.
   */
  acquire(contractId: string, holderId: string, ttlMs?: number): boolean;

  /** Release a lock. Only the holder can release. */
  release(contractId: string, holderId: string): boolean;

  /** Check if a contract is locked. */
  isLocked(contractId: string): boolean;

  /** Get the holder of a lock. */
  getHolder(contractId: string): string | null;

  /** Force-release expired locks (called periodically). */
  cleanup(): number;
}

/* ------------------------------------------------------------------ */
/*  In-memory implementation                                           */
/* ------------------------------------------------------------------ */

// MVP-deferred: Implementation provided for completeness but not
// exercised in the current pipeline. Will be activated post-MVP.

const DEFAULT_TTL_MS = 30_000; // 30 seconds

export function createContractLockManager(): ContractLockManager {
  const locks = new Map<string, LockEntry>();

  function isExpired(entry: LockEntry): boolean {
    return Date.now() - entry.acquiredAt > entry.ttlMs;
  }

  return {
    acquire(contractId: string, holderId: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
      const existing = locks.get(contractId);
      if (existing && !isExpired(existing)) {
        // Already locked by same holder: re-entrant, refresh TTL
        if (existing.holderId === holderId) {
          locks.set(contractId, {
            contractId,
            holderId,
            acquiredAt: Date.now(),
            ttlMs,
          });
          return true;
        }
        return false;
      }
      locks.set(contractId, {
        contractId,
        holderId,
        acquiredAt: Date.now(),
        ttlMs,
      });
      return true;
    },

    release(contractId: string, holderId: string): boolean {
      const existing = locks.get(contractId);
      if (!existing) return false;
      if (existing.holderId !== holderId) return false;
      locks.delete(contractId);
      return true;
    },

    isLocked(contractId: string): boolean {
      const existing = locks.get(contractId);
      if (!existing) return false;
      if (isExpired(existing)) {
        locks.delete(contractId);
        return false;
      }
      return true;
    },

    getHolder(contractId: string): string | null {
      const existing = locks.get(contractId);
      if (!existing) return null;
      if (isExpired(existing)) {
        locks.delete(contractId);
        return null;
      }
      return existing.holderId;
    },

    cleanup(): number {
      let cleaned = 0;
      for (const [key, entry] of locks.entries()) {
        if (isExpired(entry)) {
          locks.delete(key);
          cleaned++;
        }
      }
      return cleaned;
    },
  };
}
