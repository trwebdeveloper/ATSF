/**
 * OrchestratorConfig resolution from ATSFConfig and CLI overrides (T14).
 *
 * Provides a function to resolve an OrchestratorConfig from partial inputs,
 * applying sensible defaults for missing fields.
 */

import type { OrchestratorConfig } from './engine.js';

/**
 * Options accepted by resolveOrchestratorConfig.
 * inputPath and workspaceRoot are required; the rest have defaults.
 */
export interface ResolveOrchestratorConfigOptions {
  readonly inputPath: string;
  readonly workspaceRoot: string;
  readonly providers?: readonly string[];
  readonly maxConcurrency?: number;
  readonly interactive?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Resolve an OrchestratorConfig from partial options, applying defaults.
 *
 * Default providers: ['openrouter']
 * Default maxConcurrency: 5
 * Default interactive: false
 */
export function resolveOrchestratorConfig(
  options: ResolveOrchestratorConfigOptions,
): OrchestratorConfig {
  return {
    inputPath: options.inputPath,
    workspaceRoot: options.workspaceRoot,
    providers: options.providers ?? ['openrouter'],
    maxConcurrency: options.maxConcurrency ?? 5,
    interactive: options.interactive ?? false,
    signal: options.signal,
  };
}
