import { ConfigError } from '../shared/errors.js';
import type { ProviderAdapter, ProviderRegistry } from './types.js';

/**
 * Concrete implementation of ProviderRegistry.
 * Manages a collection of ProviderAdapter instances keyed by their id.
 */
class ProviderRegistryImpl implements ProviderRegistry {
  private readonly _providers = new Map<string, ProviderAdapter>();
  private readonly _order: string[] = [];
  private readonly _defaultId: string | undefined;

  constructor(defaultId?: string) {
    this._defaultId = defaultId;
  }

  register(provider: ProviderAdapter): void {
    if (this._providers.has(provider.id)) {
      throw new ConfigError(
        `Provider "${provider.id}" is already registered. Cannot register the same id twice.`,
      );
    }
    this._providers.set(provider.id, provider);
    this._order.push(provider.id);
  }

  get(id: string): ProviderAdapter {
    const provider = this._providers.get(id);
    if (!provider) {
      throw new ConfigError(`Provider "${id}" not found. Has it been registered?`);
    }
    return provider;
  }

  getDefault(): ProviderAdapter {
    if (this._providers.size === 0) {
      throw new ConfigError(
        'No providers are registered. Register at least one provider before calling getDefault().',
      );
    }

    // Use configured default if it exists in the registry
    if (this._defaultId !== undefined && this._providers.has(this._defaultId)) {
      return this._providers.get(this._defaultId)!;
    }

    // Fall back to the first registered provider
    const firstId = this._order[0];
    return this._providers.get(firstId)!;
  }

  list(): readonly ProviderAdapter[] {
    return this._order.map(id => this._providers.get(id)!);
  }

  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      this._order.map(async id => {
        const provider = this._providers.get(id)!;
        try {
          const healthy = await provider.healthCheck();
          results.set(id, healthy);
        } catch {
          results.set(id, false);
        }
      }),
    );

    return results;
  }
}

/**
 * Factory function to create a new ProviderRegistry.
 *
 * @param defaultId - Optional provider id to return from getDefault(). When
 *   omitted or not found, the first registered provider is used.
 */
export function createProviderRegistry(defaultId?: string): ProviderRegistry {
  return new ProviderRegistryImpl(defaultId);
}
