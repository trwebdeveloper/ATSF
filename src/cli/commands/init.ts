/**
 * `atsf init` command — T15
 *
 * Initialize a new ATSF project by creating the config file and workspace directory.
 *
 * Source: Section 3.3 (atsf init); Section 3.4 (config loading).
 */

import { Command, Flags } from '@oclif/core';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Default config template for a new ATSF project.
 */
export function createDefaultConfig(options: {
  provider?: string;
  outputDir?: string;
}): Record<string, unknown> {
  return {
    provider: {
      default: options.provider ?? 'openrouter',
    },
    debate: {
      rounds: 3,
      engine: 'judge',
      convergenceThreshold: 0.8,
    },
    build: {
      maxConcurrency: 5,
      timeout: 300_000,
    },
    gate: {
      threshold: 0.8,
      autoFix: true,
      maxFixRounds: 3,
      reporter: 'console',
    },
    output: {
      directory: options.outputDir ?? './atsf-output',
      formats: ['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack'],
    },
  };
}

/**
 * Core init logic, extracted for testability.
 */
export async function runInitLogic(options: {
  dir: string;
  force: boolean;
  provider?: string;
  outputDir?: string;
  log: (msg: string) => void;
}): Promise<void> {
  const { dir, force, provider, outputDir, log } = options;
  const configPath = join(dir, '.atsfrc.json');

  // Check if config already exists
  if (!force) {
    try {
      await stat(configPath);
      // If stat succeeds, file exists
      throw new Error(
        `Config file already exists at ${configPath}. Use --force to overwrite.`,
      );
    } catch (err) {
      // If the error is our own "already exists" error, re-throw it
      if (err instanceof Error && err.message.includes('already exists')) {
        throw err;
      }
      // Otherwise, file doesn't exist — proceed
    }
  }

  // Ensure target directory exists
  await mkdir(dir, { recursive: true });

  // Create config
  const config = createDefaultConfig({ provider, outputDir });

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  // Create output directory
  const resolvedOutputDir = join(dir, (config.output as Record<string, unknown>).directory as string);
  await mkdir(resolvedOutputDir, { recursive: true });

  log(`Initialized ATSF project in ${dir}`);
  log(`  Config: ${configPath}`);
  log(`  Output: ${resolvedOutputDir}`);
}

export default class Init extends Command {
  static override description = 'Initialize a new ATSF project with config and workspace';

  static override examples = [
    '<%= config.bin %> init',
    '<%= config.bin %> init --dir ./my-project',
    '<%= config.bin %> init --provider claude-code',
    '<%= config.bin %> init --force',
  ];

  static override flags = {
    dir: Flags.string({
      char: 'd',
      description: 'Target directory for initialization',
      default: '.',
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Overwrite existing config file',
      default: false,
    }),
    provider: Flags.string({
      char: 'p',
      description: 'Default AI provider',
      options: ['openrouter', 'claude-code'],
    }),
    'output-dir': Flags.string({
      char: 'o',
      description: 'Output directory for generated artifacts',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    await runInitLogic({
      dir: flags.dir,
      force: flags.force,
      provider: flags.provider,
      outputDir: flags['output-dir'],
      log: (msg) => this.log(msg),
    });
  }
}
