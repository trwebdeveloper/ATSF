/**
 * IssueLog: in-memory + JSONL persistence for reported issues.
 *
 * Spec Section 15.9: Issue Logging System.
 *
 * - In-memory for fast querying during server session
 * - JSONL file for persistence across restarts
 * - BM25 deduplication with 0.7 similarity threshold
 * - Root cause analysis via DAG walking
 */

import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import BM25 from 'wink-bm25-text-search';
import type { StoredIssue, ReportIssueRequest, ReportIssueResponse } from './schemas.js';
import type { CrossRefResolver } from './index/cross-ref.js';

// ─── Tokenizer ───────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 0);
}

// ─── IssueLog ────────────────────────────────────────────────────────

export class IssueLog {
  private _issues: Map<string, StoredIssue>;
  private _jsonlPath: string;
  private _crossRef: CrossRefResolver | null;

  constructor(jsonlPath: string, crossRef?: CrossRefResolver) {
    this._issues = new Map();
    this._jsonlPath = jsonlPath;
    this._crossRef = crossRef ?? null;
  }

  /**
   * Load existing issues from JSONL file.
   */
  async loadFromDisk(): Promise<void> {
    try {
      const content = await readFile(this._jsonlPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        try {
          const issue = JSON.parse(line) as StoredIssue;
          this._issues.set(issue.issueId, issue);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File doesn't exist yet, that's fine
    }
  }

  /**
   * Report a new issue. Returns the response with deduplication and root cause info.
   */
  async reportIssue(request: ReportIssueRequest): Promise<ReportIssueResponse> {
    const issueId = `ISS-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    const stored: StoredIssue = {
      issueId,
      taskId: request.taskId,
      severity: request.severity,
      category: request.category,
      summary: request.summary,
      description: request.description,
      codeSnippet: request.codeSnippet,
      filePath: request.filePath,
      reporter: request.reporter,
      createdAt: now,
      resolved: false,
    };

    // Find related issues via BM25
    const relatedIssues = this._findRelatedIssues(request.summary, request.description);

    // Find possible causes via upstream DAG walking
    const possibleCauses = this._findPossibleCauses(request.taskId);

    // Store in memory
    this._issues.set(issueId, stored);

    // Persist to JSONL
    try {
      await appendFile(this._jsonlPath, JSON.stringify(stored) + '\n', 'utf-8');
    } catch {
      // Best effort persistence
    }

    return {
      issueId,
      hasSuggestion: relatedIssues.length > 0,
      suggestion: relatedIssues.length > 0
        ? `Similar issue found: ${relatedIssues[0].summary}`
        : undefined,
      relatedIssues,
      possibleCauses,
    };
  }

  /**
   * Get all issues, optionally filtered.
   */
  getIssues(filter?: { resolved?: boolean; taskId?: string }): StoredIssue[] {
    let issues = [...this._issues.values()];
    if (filter?.resolved !== undefined) {
      issues = issues.filter((i) => i.resolved === filter.resolved);
    }
    if (filter?.taskId) {
      issues = issues.filter((i) => i.taskId === filter.taskId);
    }
    return issues;
  }

  /**
   * Get a single issue by ID.
   */
  getIssue(issueId: string): StoredIssue | undefined {
    return this._issues.get(issueId);
  }

  /**
   * Resolve an issue with an answer.
   */
  resolveIssue(issueId: string, answer: string, resolvedBy: string): boolean {
    const issue = this._issues.get(issueId);
    if (!issue) return false;

    const resolved: StoredIssue = {
      ...issue,
      resolved: true,
      resolution: answer,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
    };

    this._issues.set(issueId, resolved);
    return true;
  }

  /**
   * Get pending (unresolved) issues.
   */
  getPendingIssues(): StoredIssue[] {
    return this.getIssues({ resolved: false });
  }

  /**
   * Flush all in-memory issues to JSONL (overwrites file with current state).
   */
  async flush(): Promise<void> {
    const lines = [...this._issues.values()]
      .map((i) => JSON.stringify(i))
      .join('\n');
    await writeFile(this._jsonlPath, lines ? lines + '\n' : '', 'utf-8');
  }

  /**
   * Total number of issues.
   */
  get size(): number {
    return this._issues.size;
  }

  /**
   * Path to the JSONL file.
   */
  get jsonlPath(): string {
    return this._jsonlPath;
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private _findRelatedIssues(
    summary: string,
    description: string,
  ): ReportIssueResponse['relatedIssues'] {
    const existingIssues = [...this._issues.values()];
    if (existingIssues.length === 0) return [];

    // BM25 similarity search against existing issues
    const engine = BM25();
    engine.defineConfig({ fldWeights: { text: 1 } });
    engine.definePrepTasks([tokenize]);

    const SENTINEL = 'xyzsentinelxyz';
    const docsNeeded = Math.max(3, existingIssues.length);

    for (let i = 0; i < existingIssues.length; i++) {
      engine.addDoc(
        { text: `${existingIssues[i].summary} ${existingIssues[i].description}` },
        i,
      );
    }
    for (let i = existingIssues.length; i < docsNeeded; i++) {
      engine.addDoc({ text: `${SENTINEL}${i}pad` }, i);
    }
    engine.consolidate();

    const searchText = `${summary} ${description}`;
    const results: Array<[string | number, number]> = engine.search(searchText, 5);

    return results
      .map(([rawId, score]) => ({ id: Number(rawId), score }))
      .filter(({ id, score }) => id < existingIssues.length && score > 0.7)
      .map(({ id, score }) => ({
        issueId: existingIssues[id].issueId,
        taskId: existingIssues[id].taskId,
        summary: existingIssues[id].summary,
        similarity: Math.min(score, 1),
      }));
  }

  private _findPossibleCauses(
    taskId: string,
  ): ReportIssueResponse['possibleCauses'] {
    if (!this._crossRef) return [];

    const upstream = this._crossRef.getUpstreamTasks(taskId);
    return upstream.slice(0, 5).map((tid) => {
      const task = this._crossRef!.getTask(tid);
      return {
        taskId: tid,
        taskName: tid, // We don't have task names in cross-ref, use ID
        reason: task
          ? `Upstream dependency: writes to ${task.filesWrite.slice(0, 3).join(', ')}`
          : 'Upstream dependency',
      };
    });
  }
}
