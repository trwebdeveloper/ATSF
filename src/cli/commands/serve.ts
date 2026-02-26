/**
 * `atsf serve` command — T16
 *
 * Start the ATSF feedback server for AI coder integration.
 * Fastify server with all routes, optional MCP bridge, graceful shutdown.
 *
 * Source: Section 15.6 (atsf serve); Section 15.6.1 (Graceful Shutdown).
 */

import { Command, Flags } from '@oclif/core';
import { createServer, registerGracefulShutdown } from '../../serve/server.js';

/**
 * Core serve logic, extracted for testability.
 */
export async function runServeLogic(options: {
  port: number;
  host: string;
  outputDir: string;
  corsEnabled: boolean;
  llmEnabled: boolean;
  issueLogFile: string;
  mcp: boolean;
  watch: boolean;
  log: (msg: string) => void;
}): Promise<{ address: string; stop: () => Promise<void> }> {
  const {
    port,
    host,
    outputDir,
    corsEnabled,
    llmEnabled,
    issueLogFile,
    log,
  } = options;

  const server = await createServer({
    port,
    host,
    outputDir,
    corsEnabled,
    llmEnabled,
    issueLogFile,
    log,
  });

  registerGracefulShutdown(server, log);

  const address = await server.start();

  return {
    address,
    stop: () => server.stop(),
  };
}

export default class Serve extends Command {
  static override description =
    'Start the ATSF feedback server for AI coder integration';

  static override examples = [
    '<%= config.bin %> serve',
    '<%= config.bin %> serve --port 8080',
    '<%= config.bin %> serve --output ./my-output --no-llm',
    '<%= config.bin %> serve --mcp',
  ];

  static override flags = {
    port: Flags.integer({
      char: 'p',
      description: 'Port to listen on',
      default: 4567,
    }),
    host: Flags.string({
      char: 'h',
      description: 'Host to bind to',
      default: '127.0.0.1',
    }),
    watch: Flags.boolean({
      char: 'w',
      description: 'Watch for artifact changes and re-index',
      default: false,
    }),
    mcp: Flags.boolean({
      description: 'Also start an MCP server on stdio',
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Path to ATSF output directory',
      default: './atsf-output',
    }),
    'no-llm': Flags.boolean({
      description: 'Disable LLM synthesis for queries',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Serve);

    const { address } = await runServeLogic({
      port: flags.port,
      host: flags.host,
      outputDir: flags.output,
      corsEnabled: true,
      llmEnabled: !flags['no-llm'],
      issueLogFile: `${flags.output}/.atsf-issues.jsonl`,
      mcp: flags.mcp,
      watch: flags.watch,
      log: (msg) => this.log(msg),
    });

    this.log(`Server ready at ${address}`);
  }
}
