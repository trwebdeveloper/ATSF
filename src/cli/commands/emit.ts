/**
 * `atsf emit` command — T15
 *
 * Emit build artifacts (YAML, Markdown, tickets, prompts).
 * Delegates to the EmitterPipeline for artifact generation.
 *
 * Source: Section 3.3 (atsf emit); Section 8 (Emitter Pipeline).
 */

import { Command, Flags } from '@oclif/core';
import { loadConfig } from '../../config/loader.js';
import type { ATSFConfig } from '../../config/schema.js';
import { EmitterPipeline } from '../../emitter/pipeline.js';

/**
 * Core emit logic, extracted for testability.
 */
export async function runEmitLogic(options: {
  dir: string;
  outputDir?: string;
  formats?: string[];
  log: (msg: string) => void;
}): Promise<void> {
  const { dir, outputDir, formats, log } = options;

  // Load config
  let config: ATSFConfig;
  try {
    config = await loadConfig({ searchFrom: dir });
  } catch {
    config = await loadConfig({ overrides: {} });
  }

  const resolvedOutputDir = outputDir ?? config.output.directory;
  const resolvedFormats = formats ?? config.output.formats;

  log('Emit started');
  log(`  Directory: ${dir}`);
  log(`  Output: ${resolvedOutputDir}`);
  log(`  Formats: ${resolvedFormats.join(', ')}`);

  // Create emitter pipeline (empty — in a full implementation, emitters
  // would be registered based on the requested formats)
  const pipeline = new EmitterPipeline([]);

  // Run the pipeline with a minimal context
  await pipeline.run({
    projectName: 'atsf',
    generatedAt: new Date().toISOString(),
    vfs: {
      writeFile: () => {},
      readFile: () => undefined,
      listFiles: () => [],
      clear: () => {},
      flush: async () => {},
    } as never,
    totalCostUsd: 0,
    durationMs: 0,
  });

  log('Emit complete');
}

export default class Emit extends Command {
  static override description = 'Emit build artifacts (YAML, Markdown, tickets, prompts)';

  static override examples = [
    '<%= config.bin %> emit',
    '<%= config.bin %> emit --dir ./project',
    '<%= config.bin %> emit --output-dir ./output',
    '<%= config.bin %> emit --format task_graph --format mpd',
  ];

  static override flags = {
    dir: Flags.string({
      char: 'd',
      description: 'Project directory containing build results',
      default: '.',
    }),
    'output-dir': Flags.string({
      char: 'o',
      description: 'Output directory for emitted artifacts',
    }),
    format: Flags.string({
      char: 'f',
      description: 'Artifact format(s) to emit',
      multiple: true,
      options: ['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack'],
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Emit);

    await runEmitLogic({
      dir: flags.dir,
      outputDir: flags['output-dir'],
      formats: flags.format,
      log: (msg) => this.log(msg),
    });
  }
}
