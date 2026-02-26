/**
 * `atsf review` command — T17
 *
 * List pending escalated issues awaiting human review.
 * Tries running server first; if not running, reads JSONL directly.
 *
 * Source: Section 15.13.5 (Review API Endpoints).
 *
 * Also exports shared logic functions used by sub-commands (answer, export, import).
 */

import { Command, Flags } from '@oclif/core';
import { readFile, writeFile } from 'node:fs/promises';
import type { EscalatedIssueRecord } from '../../../serve/escalation-detector.js';

// ─── Shared Types ─────────────────────────────────────────────────────

export interface ReviewListOptions {
  readonly issueLogFile: string;
  readonly port: number;
  readonly log: (msg: string) => void;
}

export interface ReviewAnswerOptions {
  readonly issueId: string;
  readonly message: string;
  readonly resolution: 'answered' | 'dismissed' | 'deferred';
  readonly reviewer: string;
  readonly issueLogFile: string;
  readonly port: number;
  readonly log: (msg: string) => void;
}

export interface ReviewExportOptions {
  readonly issueLogFile: string;
  readonly outputFile: string;
  readonly port: number;
  readonly log: (msg: string) => void;
}

export interface ReviewImportOptions {
  readonly answersFile: string;
  readonly issueLogFile: string;
  readonly port: number;
  readonly log: (msg: string) => void;
}

export interface ReviewAnswerResult {
  readonly issueId: string;
  readonly resolved: boolean;
}

export interface ReviewImportResult {
  readonly imported: number;
  readonly failed: number;
}

// ─── JSONL Helpers ────────────────────────────────────────────────────

/**
 * Load all issues from a JSONL file. Returns empty array if file doesn't exist.
 */
async function loadIssuesFromJSONL(
  jsonlPath: string,
): Promise<EscalatedIssueRecord[]> {
  try {
    const content = await readFile(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    return lines.map((l) => JSON.parse(l) as EscalatedIssueRecord);
  } catch {
    return [];
  }
}

/**
 * Persist all issues back to JSONL (overwrites).
 */
async function saveIssuesToJSONL(
  jsonlPath: string,
  issues: EscalatedIssueRecord[],
): Promise<void> {
  const lines = issues.map((i) => JSON.stringify(i)).join('\n');
  await writeFile(jsonlPath, lines ? lines + '\n' : '', 'utf-8');
}

/**
 * Check if atsf serve is running on the given port by hitting /health.
 */
async function isServerRunning(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── runReviewListLogic ───────────────────────────────────────────────

/**
 * Core list logic, extracted for testability.
 * Returns pending issues (status === 'pending').
 */
export async function runReviewListLogic(
  options: ReviewListOptions,
): Promise<EscalatedIssueRecord[]> {
  const { issueLogFile, port, log } = options;

  // Try running server first
  if (await isServerRunning(port)) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/review/pending`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        log('(via running server)');
        const body = (await resp.json()) as { issues: EscalatedIssueRecord[] };
        return body.issues;
      }
    } catch {
      // Fall through to direct JSONL
    }
  }

  // Direct JSONL read
  log('Reading issues from local file...');
  const all = await loadIssuesFromJSONL(issueLogFile);
  return all.filter((i) => (i as { status?: string }).status === 'pending');
}

// ─── runReviewAnswerLogic ─────────────────────────────────────────────

/**
 * Core answer logic, extracted for testability.
 */
export async function runReviewAnswerLogic(
  options: ReviewAnswerOptions,
): Promise<ReviewAnswerResult> {
  const { issueId, message, resolution, reviewer, issueLogFile, port, log } =
    options;

  // Try running server first
  if (await isServerRunning(port)) {
    try {
      const body: Record<string, unknown> = {
        issueId,
        resolution,
        reviewer,
      };
      if (message) {
        body['answer'] = message;
      }

      const resp = await fetch(
        `http://127.0.0.1:${port}/api/review/${issueId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (resp.ok) {
        log('(via running server)');
        const data = (await resp.json()) as { resolved?: boolean };
        return { issueId, resolved: data.resolved ?? true };
      }
    } catch {
      // Fall through to direct JSONL
    }
  }

  // Direct JSONL update
  log('Updating issue in local file...');
  const issues = await loadIssuesFromJSONL(issueLogFile);
  const idx = issues.findIndex((i) => i.issueId === issueId);

  if (idx === -1) {
    return { issueId, resolved: false };
  }

  const updated: EscalatedIssueRecord = {
    ...issues[idx],
    status: resolution,
    resolvedAt: new Date().toISOString(),
    resolution: {
      issueId,
      resolution,
      answer: message || undefined,
      reviewer,
    },
  };

  issues[idx] = updated;
  await saveIssuesToJSONL(issueLogFile, issues);

  return { issueId, resolved: true };
}

// ─── runReviewExportLogic ─────────────────────────────────────────────

/**
 * Core export logic, extracted for testability.
 * Exports pending issues to a JSON file for offline editing.
 */
export async function runReviewExportLogic(
  options: ReviewExportOptions,
): Promise<void> {
  const { issueLogFile, outputFile, port, log } = options;

  // Try running server first
  let issues: EscalatedIssueRecord[] = [];

  if (await isServerRunning(port)) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/review/pending`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        log('(via running server)');
        const body = (await resp.json()) as { issues: EscalatedIssueRecord[] };
        issues = body.issues;
      }
    } catch {
      // Fall through
    }
  }

  if (issues.length === 0) {
    log('Reading issues from local file...');
    const all = await loadIssuesFromJSONL(issueLogFile);
    issues = all.filter((i) => (i as { status?: string }).status === 'pending');
  }

  await writeFile(outputFile, JSON.stringify(issues, null, 2), 'utf-8');
  log(`Exported ${issues.length} pending issue(s) to ${outputFile}`);
}

// ─── runReviewImportLogic ─────────────────────────────────────────────

/**
 * Core import logic, extracted for testability.
 * Imports answers from a JSON file and applies them.
 */
export async function runReviewImportLogic(
  options: ReviewImportOptions,
): Promise<ReviewImportResult> {
  const { answersFile, issueLogFile, port, log } = options;

  // Load answers from file
  const content = await readFile(answersFile, 'utf-8');
  const answers = JSON.parse(content) as Array<{
    issueId: string;
    resolution: 'answered' | 'dismissed' | 'deferred';
    answer?: string;
    reviewer?: string;
  }>;

  let imported = 0;
  let failed = 0;

  for (const ans of answers) {
    const result = await runReviewAnswerLogic({
      issueId: ans.issueId,
      message: ans.answer ?? '',
      resolution: ans.resolution,
      reviewer: ans.reviewer ?? 'import',
      issueLogFile,
      port,
      log: () => {
        // Suppress per-item logs
      },
    });

    if (result.resolved) {
      imported++;
    } else {
      failed++;
      log(`Failed to resolve issue ${ans.issueId}`);
    }
  }

  log(`Imported ${imported} answer(s), ${failed} failed`);
  return { imported, failed };
}

// ─── Oclif Command ────────────────────────────────────────────────────

export default class Review extends Command {
  static override description =
    'List pending escalated issues awaiting human review';

  static override examples = [
    '<%= config.bin %> review',
    '<%= config.bin %> review --format json',
    '<%= config.bin %> review --port 8080',
  ];

  static override flags = {
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      default: 'text',
      options: ['text', 'json'],
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
    const { flags } = await this.parse(Review);
    const issueLogFile = `${flags.output}/.atsf-issues.jsonl`;

    const issues = await runReviewListLogic({
      issueLogFile,
      port: flags.port,
      log: (msg) => this.log(msg),
    });

    if (flags.format === 'json') {
      this.log(JSON.stringify(issues, null, 2));
    } else {
      if (issues.length === 0) {
        this.log('No pending issues.');
        return;
      }

      this.log(`${issues.length} pending issue(s):\n`);
      for (const issue of issues) {
        const iss = issue as unknown as {
          issueId: string;
          severity: string;
          category: string;
          summary: string;
          createdAt: string;
          blockedTaskIds?: string[];
        };
        this.log(`  [${iss.severity.toUpperCase()}] ${iss.issueId}`);
        this.log(`    Category: ${iss.category}`);
        this.log(`    Summary: ${iss.summary}`);
        this.log(`    Created: ${iss.createdAt}`);
        if (iss.blockedTaskIds && iss.blockedTaskIds.length > 0) {
          this.log(`    Blocking: ${iss.blockedTaskIds.join(', ')}`);
        }
        this.log('');
      }
    }
  }
}
