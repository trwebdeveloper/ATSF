/**
 * Pre-command init hook — T15
 *
 * Loads the ATSF configuration via cosmiconfig before any command runs.
 * The loaded config is stored on the global context for commands to access.
 *
 * Source: Section 3.1 Oclif hooks; Section 3.4 Config loading.
 */

import type { Hook } from '@oclif/core';
import { loadConfig } from '../../config/loader.js';
import type { ATSFConfig } from '../../config/schema.js';

/**
 * Global config cache, populated by the init hook and consumed by commands.
 * Commands that need config should import `getLoadedConfig()`.
 */
let _loadedConfig: ATSFConfig | undefined;

/**
 * Get the config loaded by the init hook.
 * Returns undefined if the hook has not run yet (e.g., during testing).
 */
export function getLoadedConfig(): ATSFConfig | undefined {
  return _loadedConfig;
}

/**
 * Set config programmatically (useful for testing).
 */
export function setLoadedConfig(config: ATSFConfig | undefined): void {
  _loadedConfig = config;
}

/**
 * Oclif init hook: runs before every command.
 * Loads config silently; commands that need it can access via getLoadedConfig().
 * If config loading fails (e.g., no config file), the hook does NOT block —
 * commands like `atsf init` don't need a pre-existing config.
 */
const hook: Hook<'init'> = async function (_options) {
  try {
    _loadedConfig = await loadConfig();
  } catch {
    // Config may not exist yet (e.g., before `atsf init`).
    // Commands that require config will check and fail with a clear message.
    _loadedConfig = undefined;
  }
};

export default hook;
