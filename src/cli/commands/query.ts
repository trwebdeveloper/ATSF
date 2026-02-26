/**
 * `atsf query` command — T16
 *
 * Query ATSF artifacts about the project.
 * Tries running server first; if not running, loads artifacts in-process.
 *
 * Source: Section 15.7 (atsf query).
 */

import { Args, Command, Flags } from '@oclif/core';
import { ArtifactIndex } from '../../serve/index/artifact-index.js';
import { QueryEngine } from '../../serve/query-engine.js';

/**
 * Core query logic, extracted for testability.
 */
export async function runQueryLogic(options: {
  question: string;
  taskId?: string;
  format: string;
  noLlm: boolean;
  port: number;
  outputDir: string;
  log: (msg: string) => void;
}): Promise<{ answer: string; confidence: string; sources: Array<{ file: string }> }> {
  const { question, taskId, noLlm, outputDir, log } = options;

  // Try to connect to running atsf serve instance
  let result: Awaited<ReturnType<QueryEngine['query']>> | null = null;

  try {
    const url = `http://127.0.0.1:${options.port}/api/query`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        taskId,
        rawContext: noLlm,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      result = (await resp.json()) as Awaited<ReturnType<QueryEngine['query']>>;
      log('(via running server)');
    }
  } catch {
    // Server not running, fall through to in-process query
  }

  // If no running server, build ArtifactIndex in-process
  if (!result) {
    log('No running server detected, loading artifacts in-process...');

    const index = new ArtifactIndex(outputDir);
    await index.load();

    const engine = new QueryEngine({
      index,
      llmEnabled: !noLlm,
    });

    result = await engine.query({
      question,
      taskId,
      rawContext: noLlm,
      maxChunks: 5,
    });
  }

  return {
    answer: result.answer,
    confidence: result.confidence,
    sources: result.sources,
  };
}

export default class Query extends Command {
  static override description = 'Query ATSF artifacts about the project';

  static override examples = [
    '<%= config.bin %> query "What files does TASK-001 create?"',
    '<%= config.bin %> query "Explain the auth module" --task TASK-005',
    '<%= config.bin %> query "List all dependencies" --format json',
  ];

  static override args = {
    question: Args.string({
      description: 'Natural language question about the project',
      required: true,
    }),
  };

  static override flags = {
    task: Flags.string({
      char: 't',
      description: 'Scope the query to a specific task ID',
    }),
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      default: 'text',
      options: ['text', 'json'],
    }),
    'no-llm': Flags.boolean({
      description: 'Return raw context without LLM synthesis',
      default: false,
    }),
    port: Flags.integer({
      char: 'p',
      description: 'Port of running atsf serve instance',
      default: 4567,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Path to ATSF output directory',
      default: './atsf-output',
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Query);

    const result = await runQueryLogic({
      question: args.question,
      taskId: flags.task,
      format: flags.format ?? 'text',
      noLlm: flags['no-llm'],
      port: flags.port,
      outputDir: flags.output,
      log: (msg) => this.log(msg),
    });

    if (flags.format === 'json') {
      this.log(JSON.stringify(result, null, 2));
    } else {
      this.log(`Confidence: ${result.confidence}`);
      this.log('');
      this.log(result.answer);
      if (result.sources.length > 0) {
        this.log('');
        this.log('Sources:');
        for (const s of result.sources) {
          this.log(`  - ${s.file}`);
        }
      }
    }
  }
}
