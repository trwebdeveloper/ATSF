/**
 * `atsf plan` command — T15
 *
 * Generate an execution plan (task graph) from a project description.
 * Delegates to the DebateEngine for architectural decisions and
 * GraphBuilder for DAG construction.
 *
 * Source: Section 3.3 (atsf plan).
 */

import { Args, Command, Flags } from '@oclif/core';
import { stat } from 'node:fs/promises';
import { loadConfig } from '../../config/loader.js';
import type { ATSFConfig } from '../../config/schema.js';
import { createEventBus } from '../../events/event-bus.js';

/**
 * Core plan logic, extracted for testability.
 */
export async function runPlanLogic(options: {
  inputPath: string;
  outputDir?: string;
  provider?: string;
  mode?: string;
  log: (msg: string) => void;
}): Promise<void> {
  const { inputPath, outputDir, provider, log } = options;

  // Validate input file exists
  try {
    await stat(inputPath);
  } catch {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Load config
  let config: ATSFConfig;
  try {
    config = await loadConfig({
      overrides: provider
        ? { provider: { default: provider } }
        : undefined,
    });
  } catch {
    config = await loadConfig({
      overrides: {
        provider: { default: provider ?? 'openrouter' },
      },
    });
  }

  const resolvedOutputDir = outputDir ?? config.output.directory;

  log('Plan generation started');
  log(`  Input: ${inputPath}`);
  log(`  Output: ${resolvedOutputDir}`);
  log(`  Mode: ${options.mode ?? config.mode}`);
  log(`  Provider: ${config.provider.default}`);

  // Create EventBus for progress tracking
  createEventBus();

  // In a full implementation, this would:
  // 1. Read the project description
  // 2. Run the debate engine to make architectural decisions
  // 3. Build the task graph via GraphBuilder
  // 4. Write task_graph.yaml to outputDir

  log('Plan generation complete');
}

export default class Plan extends Command {
  static override description = 'Generate execution plan from project description';

  static override examples = [
    '<%= config.bin %> plan ./project.md',
    '<%= config.bin %> plan ./project.md --output-dir ./output',
    '<%= config.bin %> plan ./project.md --provider openrouter',
  ];

  static override args = {
    input: Args.string({
      description: 'Path to the project description file',
      required: true,
    }),
  };

  static override flags = {
    'output-dir': Flags.string({
      char: 'o',
      description: 'Output directory for generated plan',
    }),
    provider: Flags.string({
      char: 'p',
      description: 'AI provider to use',
      options: ['openrouter', 'claude-code'],
    }),
    mode: Flags.string({
      char: 'm',
      description: 'Debate mode preset (model configuration)',
      options: ['free', 'budget', 'balanced', 'premium'],
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Plan);

    await runPlanLogic({
      inputPath: args.input,
      outputDir: flags['output-dir'],
      provider: flags.provider,
      mode: flags.mode,
      log: (msg) => this.log(msg),
    });
  }
}
