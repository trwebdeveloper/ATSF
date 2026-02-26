/**
 * `atsf review answer <issueId>` command — T17
 *
 * Submit a resolution for an escalated issue.
 *
 * Source: Section 15.13.5 (POST /api/review/:issueId).
 */

import { Args, Command, Flags } from '@oclif/core';
import { runReviewAnswerLogic } from './index.js';

export default class ReviewAnswer extends Command {
  static override description = 'Submit a resolution for an escalated issue';

  static override examples = [
    '<%= config.bin %> review answer ESC-abc12345 --message "Use JWT for auth"',
    '<%= config.bin %> review answer ESC-abc12345 --resolution dismissed',
    '<%= config.bin %> review answer ESC-abc12345 --message "Deferred" --resolution deferred',
  ];

  static override args = {
    issueId: Args.string({
      description: 'Issue ID to resolve (e.g. ESC-abc12345)',
      required: true,
    }),
  };

  static override flags = {
    message: Flags.string({
      char: 'm',
      description: 'Answer or note to attach to the resolution',
      default: '',
    }),
    resolution: Flags.string({
      char: 'r',
      description: 'Resolution type',
      default: 'answered',
      options: ['answered', 'dismissed', 'deferred'],
    }),
    reviewer: Flags.string({
      description: 'Reviewer name',
      default: 'human',
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
    const { args, flags } = await this.parse(ReviewAnswer);
    const issueLogFile = `${flags.output}/.atsf-issues.jsonl`;

    const resolution = flags.resolution as 'answered' | 'dismissed' | 'deferred';

    if (resolution === 'answered' && !flags.message) {
      this.error('--message is required when resolution is "answered"');
    }

    const result = await runReviewAnswerLogic({
      issueId: args.issueId,
      message: flags.message,
      resolution,
      reviewer: flags.reviewer,
      issueLogFile,
      port: flags.port,
      log: (msg) => this.log(msg),
    });

    if (result.resolved) {
      this.log(`Issue ${result.issueId} resolved as "${resolution}".`);
    } else {
      this.error(`Issue ${result.issueId} not found.`);
    }
  }
}
