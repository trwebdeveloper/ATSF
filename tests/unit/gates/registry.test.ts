import { describe, it, expect } from 'vitest';
import { GateRegistry, BUILTIN_GATES } from '../../../src/gates/registry.js';
import type { GatePlugin, GateResult } from '../../../src/gates/types.js';
import { createDefaultConfig } from './helpers.js';

function createMockGate(overrides: Partial<GatePlugin>): GatePlugin {
  return {
    id: 'mock',
    name: 'Mock Gate',
    version: '1.0.0',
    priority: 99,
    fixable: false,
    async run(): Promise<GateResult> {
      return {
        gateId: 'mock',
        score: 1.0,
        passed: true,
        findings: [],
        fixes: [],
        durationMs: 0,
      };
    },
    ...overrides,
  };
}

describe('GateRegistry', () => {
  it('registers built-in gates on construction', () => {
    const registry = new GateRegistry();
    const all = registry.getAll();

    expect(all.length).toBe(5);
    expect(all.map(g => g.id)).toContain('security');
    expect(all.map(g => g.id)).toContain('buildability');
    expect(all.map(g => g.id)).toContain('consistency');
    expect(all.map(g => g.id)).toContain('coverage');
    expect(all.map(g => g.id)).toContain('testability');
  });

  it('getAll() returns gates sorted by priority ascending', () => {
    const registry = new GateRegistry();
    const all = registry.getAll();

    for (let i = 0; i < all.length - 1; i++) {
      expect(all[i].priority).toBeLessThanOrEqual(all[i + 1].priority);
    }
  });

  it('built-in gates are in correct priority order', () => {
    const registry = new GateRegistry();
    const all = registry.getAll();

    expect(all[0].id).toBe('security');      // priority 0
    expect(all[1].id).toBe('buildability');   // priority 1
    expect(all[2].id).toBe('consistency');    // priority 2
    expect(all[3].id).toBe('coverage');       // priority 3
    expect(all[4].id).toBe('testability');    // priority 4
  });

  it('register() adds a custom gate', () => {
    const registry = new GateRegistry();
    const customGate = createMockGate({ id: 'custom-gate', priority: 10 });

    registry.register(customGate);
    expect(registry.get('custom-gate')).toBe(customGate);
    expect(registry.getAll().length).toBe(6);
  });

  it('register() throws if gate ID is already registered', () => {
    const registry = new GateRegistry();

    expect(() => {
      registry.register(createMockGate({ id: 'security' }));
    }).toThrow('Gate "security" is already registered');
  });

  it('get() returns undefined for unknown gate ID', () => {
    const registry = new GateRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('getEnabled() filters by config', () => {
    const registry = new GateRegistry();
    const config = createDefaultConfig({
      gates: {
        coverage: { enabled: false, threshold: 0.8, autoFix: true, rules: {} },
        consistency: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
        testability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
        buildability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
        security: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
      },
    });

    const enabled = registry.getEnabled(config);
    expect(enabled.length).toBe(4);
    expect(enabled.map(g => g.id)).not.toContain('coverage');
  });

  it('supports empty builtins for custom-only registry', () => {
    const registry = new GateRegistry([]);
    expect(registry.getAll()).toHaveLength(0);

    const customGate = createMockGate({ id: 'custom', priority: 5 });
    registry.register(customGate);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('BUILTIN_GATES has 5 entries', () => {
    expect(BUILTIN_GATES.length).toBe(5);
  });
});
