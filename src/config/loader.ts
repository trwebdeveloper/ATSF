import { cosmiconfig } from 'cosmiconfig';
import { TypeScriptLoader } from 'cosmiconfig-typescript-loader';
import { ZodError } from 'zod';
import { ATSFConfigSchema } from './schema.js';
import type { ATSFConfig } from './schema.js';
import { ConfigError } from '../shared/errors.js';

/**
 * Options for loadConfig().
 */
export interface LoadConfigOptions {
  /**
   * Directory from which cosmiconfig starts searching for config files.
   * Defaults to `process.cwd()`.
   */
  searchFrom?: string;

  /**
   * Override values that are deep-merged on top of the config file contents
   * (overrides win over file values).
   */
  overrides?: Record<string, unknown>;
}

/**
 * Deep-merge two plain objects. Arrays are replaced, not merged.
 * `source` values override `target` values.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/**
 * Create the cosmiconfig explorer for ATSF.
 *
 * Search order matches spec Section 3.4:
 *   atsf.config.ts, atsf.config.js, atsf.config.json,
 *   .atsfrc.json, .atsfrc.yaml, package.json (atsf key)
 */
function createExplorer(): ReturnType<typeof cosmiconfig> {
  return cosmiconfig('atsf', {
    searchPlaces: [
      'atsf.config.ts',
      'atsf.config.js',
      'atsf.config.json',
      '.atsfrc.json',
      '.atsfrc.yaml',
      'package.json',
    ],
    loaders: {
      '.ts': TypeScriptLoader(),
    },
  });
}

/**
 * Load, validate, and return the ATSF configuration.
 *
 * 1. Searches for a config file via cosmiconfig (`.atsfrc.yaml`,
 *    `.atsfrc.json`, `atsf.config.ts`, etc.).
 * 2. Deep-merges any `overrides` on top of the file contents.
 * 3. Validates through `ATSFConfigSchema` (Zod v4 strict mode).
 * 4. Returns the fully-typed `ATSFConfig` with all defaults applied.
 *
 * @throws {ConfigError} if validation fails (wraps ZodError as `cause`).
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<ATSFConfig> {
  const { searchFrom, overrides } = options;

  let fileConfig: Record<string, unknown> = {};

  try {
    const explorer = createExplorer();
    const result = await explorer.search(searchFrom);
    if (result && !result.isEmpty) {
      fileConfig = result.config as Record<string, unknown>;
    }
  } catch (err) {
    throw new ConfigError(
      `Failed to load config file: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }

  // Merge: file config < overrides
  const merged = overrides ? deepMerge(fileConfig, overrides) : fileConfig;

  try {
    return ATSFConfigSchema.parse(merged);
  } catch (err) {
    if (err instanceof ZodError) {
      const paths = err.issues
        .map(i => i.path.join('.') || '(root)')
        .join(', ');
      throw new ConfigError(
        `Invalid configuration: ${paths} — ${err.message}`,
        err,
      );
    }
    throw new ConfigError(
      `Unexpected config validation error: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
    );
  }
}
