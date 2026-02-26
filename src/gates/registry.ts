/**
 * Gate Registry — T12
 *
 * Flat array registration pattern (Section 7.7).
 * Built-in gates in priority order + custom gate registration.
 */

import { coverageGate } from './coverage.js';
import { consistencyGate } from './consistency.js';
import { testabilityGate } from './testability.js';
import { buildabilityGate } from './buildability.js';
import { securityGate } from './security.js';
import type { GatePlugin, ResolvedGateConfig } from './types.js';

/** Built-in gates in priority order (lower index = higher fix priority). */
export const BUILTIN_GATES: readonly GatePlugin[] = [
  securityGate,       // priority 0 -- fixes win over all others
  buildabilityGate,   // priority 1
  consistencyGate,    // priority 2
  coverageGate,       // priority 3
  testabilityGate,    // priority 4
];

/** Gate registry combining built-in and custom gates. */
export class GateRegistry {
  private readonly gates = new Map<string, GatePlugin>();

  constructor(builtins: readonly GatePlugin[] = BUILTIN_GATES) {
    for (const gate of builtins) {
      this.register(gate);
    }
  }

  /** Register a gate plugin. Throws if a gate with the same ID is already registered. */
  register(gate: GatePlugin): void {
    if (this.gates.has(gate.id)) {
      throw new Error(`Gate "${gate.id}" is already registered`);
    }
    this.gates.set(gate.id, gate);
  }

  /** Get all registered gates sorted by priority (ascending). */
  getAll(): GatePlugin[] {
    return [...this.gates.values()].sort((a, b) => a.priority - b.priority);
  }

  /** Get enabled gates based on configuration. */
  getEnabled(config: ResolvedGateConfig): GatePlugin[] {
    return this.getAll().filter(g => config.gates[g.id]?.enabled !== false);
  }

  /** Get a gate by ID. Returns undefined if not found. */
  get(id: string): GatePlugin | undefined {
    return this.gates.get(id);
  }
}
