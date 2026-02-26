/**
 * `atsf review export` command — T17
 *
 * Export pending issues to a JSON file for offline review and answering.
 *
 * Source: Section 15.13.5.
 */

import { Command, Flags } from '@oclif/core';
import { runReviewExportLogic } from './index.js';

export default class ReviewExport extends Command {
  static override description =
    'Export pending issues to a JSON file for offline review';

  static override examples = [
    '<%= config.bin %> review export',
    '<%= config.bin %> review export --file ./answers.json',
    '<%= config.bin %> review export --output ./my-output --file ./my-answers.json',
  ];

  static override flags = {
    file: Flags.string({
      char: 'f',
      description: 'Output JSON file path',
      default: './atsf-pending-issues.json',
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
    const { flags } = await this.parse(ReviewExport);
    const issueLogFile = `${flags.output}/.atsf-issues.jsonl`;

    await runReviewExportLogic({
      issueLogFile,
      outputFile: flags.file,
      port: flags.port,
      log: (msg) => this.log(msg),
    });
  }
}
