import { describe, it, expect, beforeEach } from 'vitest';
import { createProviderRegistry } from '../../../src/providers/registry.js';
import { MockProvider } from '../../helpers/mock-provider.js';
import type { ProviderRegistry } from '../../../src/providers/types.js';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = createProviderRegistry();
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  it('registers a provider and retrieves it by id', () => {
    const provider = new MockProvider({ id: 'alpha' });
    registry.register(provider);
    expect(registry.get('alpha')).toBe(provider);
  });

  it('throws ConfigError on duplicate registration', () => {
    const provider = new MockProvider({ id: 'dup' });
    registry.register(provider);
    expect(() => registry.register(provider)).toThrow(/already registered/i);
  });

  it('throws ConfigError when registering a second provider with the same id', () => {
    registry.register(new MockProvider({ id: 'same' }));
    expect(() => registry.register(new MockProvider({ id: 'same' }))).toThrow();
  });

  it('throws ConfigError when getting an unregistered provider', () => {
    expect(() => registry.get('unknown')).toThrow(/not found/i);
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  it('list() returns all registered providers', () => {
    const a = new MockProvider({ id: 'a' });
    const b = new MockProvider({ id: 'b' });
    registry.register(a);
    registry.register(b);
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(a);
    expect(list).toContain(b);
  });

  it('list() returns empty array when no providers registered', () => {
    expect(registry.list()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // getDefault()
  // -------------------------------------------------------------------------

  it('getDefault() returns the first registered provider when no default is configured', () => {
    const first = new MockProvider({ id: 'first' });
    const second = new MockProvider({ id: 'second' });
    registry.register(first);
    registry.register(second);
    expect(registry.getDefault()).toBe(first);
  });

  it('getDefault() throws when no providers are registered', () => {
    expect(() => registry.getDefault()).toThrow(/no providers/i);
  });

  it('getDefault() returns the configured default provider by id', () => {
    const a = new MockProvider({ id: 'a' });
    const b = new MockProvider({ id: 'b' });
    const reg = createProviderRegistry('b');
    reg.register(a);
    reg.register(b);
    expect(reg.getDefault()).toBe(b);
  });

  it('getDefault() falls back to first if configured default is not registered', () => {
    const a = new MockProvider({ id: 'a' });
    const reg = createProviderRegistry('missing');
    reg.register(a);
    // configured default 'missing' not registered — falls back to first
    expect(reg.getDefault()).toBe(a);
  });

  // -------------------------------------------------------------------------
  // healthCheckAll()
  // -------------------------------------------------------------------------

  it('healthCheckAll() returns a Map of id → boolean for all providers', async () => {
    const healthy = new MockProvider({ id: 'ok', healthy: true });
    const sick = new MockProvider({ id: 'bad', healthy: false });
    registry.register(healthy);
    registry.register(sick);

    const results = await registry.healthCheckAll();
    expect(results).toBeInstanceOf(Map);
    expect(results.get('ok')).toBe(true);
    expect(results.get('bad')).toBe(false);
  });

  it('healthCheckAll() returns empty Map when no providers registered', async () => {
    const results = await registry.healthCheckAll();
    expect(results.size).toBe(0);
  });

  it('healthCheckAll() catches errors and maps them to false', async () => {
    const broken = new MockProvider({ id: 'broken' });
    broken.setHealthy(false);
    // Override to throw
    broken.healthCheck = async () => { throw new Error('network failure'); };
    registry.register(broken);

    const results = await registry.healthCheckAll();
    expect(results.get('broken')).toBe(false);
  });
});
