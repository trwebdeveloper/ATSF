/**
 * `atsf review import <answersFile>` command — T17
 *
 * Import answers from a JSON file and apply them to pending issues.
 * The answers file should be the modified output from `atsf review export`.
 *
 * Source: Section 15.13.5.
 */

import { Args, Command, Flags } from '@oclif/core';
import { runReviewImportLogic } from './index.js';

export default class ReviewImport extends Command {
  static override description =
    'Import answers from a JSON file and apply them to pending issues';

  static override examples = [
    '<%= config.bin %> review import ./answers.json',
    '<%= config.bin %> review import ./atsf-pending-issues.json --port 8080',
  ];

  static override args = {
    answersFile: Args.string({
      description: 'Path to answers JSON file (output from atsf review export)',
      required: true,
    }),
  };

  static override flags = {
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
    const { args, flags } = await this.parse(ReviewImport);
    const issueLogFile = `${flags.output}/.atsf-issues.jsonl`;

    const result = await runReviewImportLogic({
      answersFile: args.answersFile,
      issueLogFile,
      port: flags.port,
      log: (msg) => this.log(msg),
    });

    if (result.failed > 0) {
      this.warn(
        `Import completed with ${result.failed} failure(s). Check issue IDs.`,
      );
    } else {
      this.log(`Successfully imported ${result.imported} answer(s).`);
    }
  }
}
