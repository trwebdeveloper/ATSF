/**
 * `atsf build` command — T15
 *
 * Execute the DAG-scheduled task graph.
 * Delegates to OrchestratorEngine for full pipeline execution.
 *
 * Source: Section 3.3 (atsf build); Section 2.3.3 (OrchestratorEngine).
 */

import { Args, Command, Flags } from '@oclif/core';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import type { ATSFConfig } from '../../config/schema.js';
import { resolveMode } from '../../config/presets.js';
import type { ModeName } from '../../config/presets.js';
import type { OrchestratorConfig } from '../../orchestrator/engine.js';
import { generate } from '../../generator/index.js';
import { createOpenRouterProvider } from '../../providers/openrouter.js';
import { EmitterPipeline } from '../../emitter/pipeline.js';
import { VirtualFS } from '../../emitter/virtual-fs.js';
import { TaskGraphEmitter } from '../../emitter/emitters/task-graph.js';
import { RepoBlueprintEmitter } from '../../emitter/emitters/repo-blueprint.js';
import { MpdEmitter } from '../../emitter/emitters/mpd.js';
import { TicketsEmitter } from '../../emitter/emitters/tickets.js';
import { PromptPackEmitter } from '../../emitter/emitters/prompt-pack.js';
import { ManifestEmitter } from '../../emitter/emitters/manifest.js';
import type { EmitterContext } from '../../emitter/types.js';

/**
 * Core build logic, extracted for testability.
 * Returns the orchestrator config that would be used for the build.
 */
export async function runBuildLogic(options: {
  inputPath: string;
  outputDir?: string;
  provider?: string;
  concurrency?: number;
  mode?: string;
  log: (msg: string) => void;
}): Promise<OrchestratorConfig> {
  const { inputPath, outputDir, provider, concurrency, log } = options;

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
  const resolvedConcurrency = concurrency ?? config.build.maxConcurrency;
  const modeResolved = resolveMode(
    (options.mode ?? config.mode) as ModeName,
    { models: config.debate.models },
  );

  log('Build started');
  log(`  Input: ${inputPath}`);
  log(`  Output: ${resolvedOutputDir}`);
  log(`  Mode: ${options.mode ?? config.mode}`);
  log(`  Concurrency: ${resolvedConcurrency}`);
  log(`  Provider: ${config.provider.default}`);

  // Build orchestrator config
  const orchConfig: OrchestratorConfig = {
    inputPath,
    workspaceRoot: resolvedOutputDir,
    providers: [config.provider.default],
    maxConcurrency: resolvedConcurrency,
    interactive: false,
    debateModels: modeResolved.models,
    debateRounds: modeResolved.rounds,
    debateConvergenceThreshold: modeResolved.convergenceThreshold,
    debateProposerCount: modeResolved.proposerCount,
  };

  // If OPENROUTER_API_KEY is set, run real LLM pipeline
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (apiKey) {
    const startTime = Date.now();
    log('  Model: ' + modeResolved.models.proposer);
    log('');

    // 1. Create provider
    const provider = createOpenRouterProvider({ apiKey });

    // 2. Read input file
    const projectDescription = await readFile(inputPath, 'utf-8');
    const projectName = extractProjectName(projectDescription) ?? basename(inputPath, '.md');

    // 3. Generate artifact inputs via LLM
    log('Generating task graph...');
    const result = await generate(projectDescription, projectName, {
      provider,
      model: modeResolved.models.proposer,
      lang: config.lang ?? 'en',
    });
    log(`  Tasks generated: ${result.taskGraphInput.tasks.length}`);
    log(`  Tokens used: ${result.totalTokensUsed}`);

    // 4. Create VFS + emitters
    const vfs = new VirtualFS();
    const ctx: EmitterContext = {
      projectName,
      generatedAt: new Date().toISOString(),
      vfs,
      lang: config.lang ?? 'en',
      totalCostUsd: result.totalCostUsd,
      durationMs: Date.now() - startTime,
      totalTasks: result.taskGraphInput.tasks.length,
      taskGraphInput: result.taskGraphInput,
      repoBlueprintInput: result.repoBlueprintInput,
      mpdInput: result.mpdInput,
      ticketsInput: result.ticketsInput,
      promptPackInput: result.promptPackInput,
    };

    const pipeline = new EmitterPipeline([
      new TaskGraphEmitter(),
      new RepoBlueprintEmitter(),
      new MpdEmitter(),
      new TicketsEmitter(),
      new PromptPackEmitter(),
      new ManifestEmitter(),
    ]);

    // 5. Run emitters
    log('Writing artifacts...');
    await pipeline.run(ctx);

    // 6. Flush to disk
    await vfs.flush(resolvedOutputDir);

    const files = vfs.listFiles();
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    log('');
    log(`Build complete (success)`);
    log(`  Files: ${files.length}`);
    log(`  Duration: ${durationSec}s`);
    log(`  Cost: $${result.totalCostUsd.toFixed(6)}`);
    log(`  Output: ${resolvedOutputDir}`);
  } else {
    log('Build complete (success)');
    log('  Note: Set OPENROUTER_API_KEY to enable real LLM artifact generation');
  }

  return orchConfig;
}

/**
 * Extract project name from the first markdown heading.
 */
function extractProjectName(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)/m);
  return match?.[1]?.trim();
}

export default class Build extends Command {
  static override description = 'Execute DAG-scheduled task graph';

  static override examples = [
    '<%= config.bin %> build ./project.md',
    '<%= config.bin %> build ./project.md --output-dir ./output',
    '<%= config.bin %> build ./project.md --concurrency 10',
    '<%= config.bin %> build ./project.md --provider openrouter',
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
      description: 'Output directory for build artifacts',
    }),
    provider: Flags.string({
      char: 'p',
      description: 'AI provider to use',
      options: ['openrouter', 'claude-code'],
    }),
    concurrency: Flags.integer({
      char: 'c',
      description: 'Maximum concurrent tasks',
      default: 5,
      min: 1,
      max: 50,
    }),
    mode: Flags.string({
      char: 'm',
      description: 'Debate mode preset (model configuration)',
      options: ['free', 'budget', 'balanced', 'premium'],
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Build);

    await runBuildLogic({
      inputPath: args.input,
      outputDir: flags['output-dir'],
      provider: flags.provider,
      concurrency: flags.concurrency,
      mode: flags.mode,
      log: (msg) => this.log(msg),
    });
  }
}
