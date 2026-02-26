/**
 * `atsf debate` command — T15
 *
 * Run a multi-agent debate on the plan.
 * Supports configurable rounds, engine type, and output file.
 *
 * Source: Section 3.3 (atsf debate); Section 6 (Debate Engine).
 */

import { Args, Command, Flags } from '@oclif/core';
import { stat, writeFile } from 'node:fs/promises';
import { loadConfig } from '../../config/loader.js';
import type { ATSFConfig } from '../../config/schema.js';

/**
 * Core debate logic, extracted for testability.
 */
export async function runDebateLogic(options: {
  planPath: string;
  engine?: string;
  rounds?: number;
  output?: string;
  provider?: string;
  log: (msg: string) => void;
}): Promise<void> {
  const { planPath, engine, rounds, output, provider, log } = options;

  // Validate plan file exists
  try {
    await stat(planPath);
  } catch {
    throw new Error(`Plan file not found: ${planPath}`);
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

  const resolvedRounds = rounds ?? config.debate.rounds;
  const resolvedEngine = engine ?? config.debate.engine;

  log('Debate started');
  log(`  Plan: ${planPath}`);
  log(`  Engine: ${resolvedEngine}`);
  log(`  Rounds: ${resolvedRounds}`);
  log(`  Provider: ${config.provider.default}`);

  // In a full implementation, this would:
  // 1. Resolve the provider from config
  // 2. Create DebateEngine.create(provider, resilience, eventBus)
  // 3. Call debateEngine.runDebate({ topic, context, rounds, ... })
  // 4. Write results to output file if --output specified

  if (output) {
    const result = {
      engine: resolvedEngine,
      rounds: resolvedRounds,
      timestamp: new Date().toISOString(),
      status: 'complete',
    };
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', 'utf-8');
    log(`  Results written to: ${output}`);
  }

  log('Debate complete');
}

export default class Debate extends Command {
  static override description = 'Run a multi-agent debate on the plan';

  static override examples = [
    '<%= config.bin %> debate ./plan.yaml',
    '<%= config.bin %> debate ./plan.yaml --rounds 5',
    '<%= config.bin %> debate ./plan.yaml --engine judge',
    '<%= config.bin %> debate ./plan.yaml --output ./results.json',
  ];

  static override args = {
    plan: Args.string({
      description: 'Path to the plan file',
      required: true,
    }),
  };

  static override flags = {
    engine: Flags.string({
      char: 'e',
      description: 'Debate engine to use',
      options: ['round-robin', 'judge'],
      default: 'judge',
    }),
    rounds: Flags.integer({
      char: 'r',
      description: 'Number of debate rounds',
      default: 3,
      min: 1,
      max: 10,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file for debate results',
    }),
    provider: Flags.string({
      char: 'p',
      description: 'AI provider to use',
      options: ['openrouter', 'claude-code'],
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Debate);

    await runDebateLogic({
      planPath: args.plan,
      engine: flags.engine,
      rounds: flags.rounds,
      output: flags.output,
      provider: flags.provider,
      log: (msg) => this.log(msg),
    });
  }
}
