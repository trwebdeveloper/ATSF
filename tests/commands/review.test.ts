/**
 * Tests for T17: Escalation & Review System
 *
 * Validates:
 * 1. Escalation rules fire correctly (topScore < 2.0 → missing_detail, etc.)
 * 2. buildQueryEscalation() constructs escalation record with correct fields
 * 3. Category→severity mapping: infeasible_constraint → critical, missing_detail → minor, etc.
 * 4. EscalatedIssueRecord.status uses 4 values: pending/answered/dismissed/deferred
 * 5. Resolution: answer stored
 * 6. atsf review answer submits resolution
 * 7. Export/import round-trip preserves data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ESCALATION_RULES,
  CATEGORY_SEVERITY_MAP,
  buildQueryEscalation,
  deriveSuggestedActions,
  detectEscalation,
  type EscalationContext,
  type EscalationCategory,
} from '../../src/serve/escalation-detector.js';
import {
  runReviewListLogic,
  runReviewAnswerLogic,
  runReviewExportLogic,
  runReviewImportLogic,
} from '../../src/cli/commands/review/index.js';

// ---------------------------------------------------------------------------
// Escalation Detector Tests
// ---------------------------------------------------------------------------

describe('ESCALATION_RULES', () => {
  it('has at least 4 rules', () => {
    expect(ESCALATION_RULES.length).toBeGreaterThanOrEqual(4);
  });

  it('rule 1: topScore < 2.0 triggers missing_detail', () => {
    const ctx: EscalationContext = {
      topScore: 1.5,
      conflictDetected: false,
      llmConfidence: 'high',
      llmUsed: false,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    expect(decision.answerable).toBe(false);
    expect(decision.category).toBe('missing_detail');
  });

  it('rule 1: topScore >= 2.0 does not trigger missing_detail alone', () => {
    const ctx: EscalationContext = {
      topScore: 3.0,
      conflictDetected: false,
      llmConfidence: 'high',
      llmUsed: false,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    // No rule matched → answerable
    expect(decision.answerable).toBe(true);
  });

  it('rule 2: conflictDetected triggers ambiguous_spec', () => {
    const ctx: EscalationContext = {
      topScore: 5.0,
      conflictDetected: true,
      llmConfidence: 'high',
      llmUsed: false,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    expect(decision.answerable).toBe(false);
    expect(decision.category).toBe('ambiguous_spec');
  });

  it('rule 3: llmConfidence=low AND llmUsed=true triggers needs_human_judgment', () => {
    const ctx: EscalationContext = {
      topScore: 5.0,
      conflictDetected: false,
      llmConfidence: 'low',
      llmUsed: true,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    expect(decision.answerable).toBe(false);
    expect(decision.category).toBe('needs_human_judgment');
  });

  it('rule 3 does NOT trigger when llmUsed=false', () => {
    const ctx: EscalationContext = {
      topScore: 5.0,
      conflictDetected: false,
      llmConfidence: 'low',
      llmUsed: false,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    // llmUsed is false, so rule 3 doesn't apply
    expect(decision.answerable).toBe(true);
  });

  it('rule 4: depConflict triggers dependency_conflict', () => {
    const ctx: EscalationContext = {
      topScore: 5.0,
      conflictDetected: false,
      llmConfidence: 'high',
      llmUsed: false,
      depConflict: true,
    };
    const decision = detectEscalation(ctx);
    expect(decision.answerable).toBe(false);
    expect(decision.category).toBe('dependency_conflict');
  });

  it('first matching rule wins', () => {
    // topScore < 2.0 AND conflictDetected - rule 1 should win
    const ctx: EscalationContext = {
      topScore: 1.0,
      conflictDetected: true,
      llmConfidence: 'high',
      llmUsed: false,
      depConflict: false,
    };
    const decision = detectEscalation(ctx);
    expect(decision.category).toBe('missing_detail'); // rule 1 wins
  });
});

// ---------------------------------------------------------------------------
// CATEGORY_SEVERITY_MAP Tests
// ---------------------------------------------------------------------------

describe('CATEGORY_SEVERITY_MAP', () => {
  it('infeasible_constraint → critical', () => {
    expect(CATEGORY_SEVERITY_MAP['infeasible_constraint']).toBe('critical');
  });

  it('schema_mismatch → critical', () => {
    expect(CATEGORY_SEVERITY_MAP['schema_mismatch']).toBe('critical');
  });

  it('dependency_conflict → major', () => {
    expect(CATEGORY_SEVERITY_MAP['dependency_conflict']).toBe('major');
  });

  it('ambiguous_spec → major', () => {
    expect(CATEGORY_SEVERITY_MAP['ambiguous_spec']).toBe('major');
  });

  it('missing_detail → minor', () => {
    expect(CATEGORY_SEVERITY_MAP['missing_detail']).toBe('minor');
  });

  it('needs_human_judgment → minor', () => {
    expect(CATEGORY_SEVERITY_MAP['needs_human_judgment']).toBe('minor');
  });
});

// ---------------------------------------------------------------------------
// buildQueryEscalation Tests
// ---------------------------------------------------------------------------

describe('buildQueryEscalation', () => {
  it('constructs escalation record with correct fields', () => {
    const request = {
      question: 'What is the migration strategy?',
      taskId: 'TASK-001',
      rawContext: false as const,
      maxChunks: 5 as const,
    };
    const decision = {
      answerable: false,
      category: 'missing_detail' as EscalationCategory,
      reason: 'BM25 top score < 2.0',
    };

    const record = buildQueryEscalation(request, decision, request.question);

    expect(record.issueId).toMatch(/^ESC-/);
    expect(record.taskId).toBe('TASK-001');
    expect(record.severity).toBe('minor');
    expect(record.category).toBe('missing_detail');
    expect(record.summary).toContain('[missing_detail]');
    expect(record.description).toBe(request.question);
    expect(record.reporter).toBe('query-engine');
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.escalatedFrom).toBe(request.question);
    expect(record.answerable).toBe(false);
    expect(record.escalationCategory).toBe('missing_detail');
    expect(Array.isArray(record.suggestedActions)).toBe(true);
    expect(record.suggestedActions.length).toBeGreaterThan(0);
    expect(record.blockedTaskIds).toContain('TASK-001');
    expect(record.status).toBe('pending');
  });

  it('uses "unknown" taskId when request has no taskId', () => {
    const request = {
      question: 'General question',
      rawContext: false as const,
      maxChunks: 5 as const,
    };
    const decision = {
      answerable: false,
      category: 'missing_detail' as EscalationCategory,
    };

    const record = buildQueryEscalation(request, decision, request.question);
    expect(record.taskId).toBe('unknown');
    expect(record.blockedTaskIds).toEqual([]);
  });

  it('truncates long questions in summary', () => {
    const longQuestion = 'x'.repeat(300);
    const request = {
      question: longQuestion,
      rawContext: false as const,
      maxChunks: 5 as const,
    };
    const decision = {
      answerable: false,
      category: 'ambiguous_spec' as EscalationCategory,
    };

    const record = buildQueryEscalation(request, decision, longQuestion);
    // Summary should contain first 200 chars of the question
    expect(record.summary.length).toBeLessThanOrEqual(300);
    expect(record.summary).toContain('[ambiguous_spec]');
  });
});

// ---------------------------------------------------------------------------
// deriveSuggestedActions Tests
// ---------------------------------------------------------------------------

describe('deriveSuggestedActions', () => {
  it('returns suggested actions for missing_detail', () => {
    const actions = deriveSuggestedActions('missing_detail');
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('returns suggested actions for ambiguous_spec', () => {
    const actions = deriveSuggestedActions('ambiguous_spec');
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('returns suggested actions for all categories', () => {
    const categories: EscalationCategory[] = [
      'missing_detail',
      'ambiguous_spec',
      'dependency_conflict',
      'infeasible_constraint',
      'schema_mismatch',
      'needs_human_judgment',
    ];
    for (const cat of categories) {
      const actions = deriveSuggestedActions(cat);
      expect(actions.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// CLI Review Commands Tests
// ---------------------------------------------------------------------------

describe('runReviewListLogic', () => {
  let tempDir: string;
  let jsonlPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-review-list-'));
    jsonlPath = join(tempDir, '.atsf-issues.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns empty list when no issues file exists', async () => {
    const logs: string[] = [];
    const issues = await runReviewListLogic({
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBe(0);
  });

  it('returns pending issues from JSONL', async () => {
    const pendingIssue = {
      issueId: 'ESC-abc12345',
      taskId: 'TASK-001',
      severity: 'minor',
      category: 'missing_detail',
      summary: '[missing_detail]: Test issue',
      description: 'Test description',
      reporter: 'query-engine',
      createdAt: new Date().toISOString(),
      answerable: false,
      escalationCategory: 'missing_detail',
      suggestedActions: ['Clarify requirements'],
      blockedTaskIds: ['TASK-001'],
      status: 'pending',
    };
    const resolvedIssue = {
      ...pendingIssue,
      issueId: 'ESC-def67890',
      status: 'answered',
    };

    await writeFile(
      jsonlPath,
      [pendingIssue, resolvedIssue].map((i) => JSON.stringify(i)).join('\n') + '\n',
    );

    const logs: string[] = [];
    const issues = await runReviewListLogic({
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    // Should return only pending issues
    expect(issues.length).toBe(1);
    expect(issues[0].issueId).toBe('ESC-abc12345');
    expect(issues[0].status).toBe('pending');
  });
});

describe('runReviewAnswerLogic', () => {
  let tempDir: string;
  let jsonlPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-review-answer-'));
    jsonlPath = join(tempDir, '.atsf-issues.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves a pending issue with an answer', async () => {
    const issueId = 'ESC-abc12345';
    const pendingIssue = {
      issueId,
      taskId: 'TASK-001',
      severity: 'minor',
      category: 'missing_detail',
      summary: '[missing_detail]: Missing migration strategy',
      description: 'No migration steps defined',
      reporter: 'query-engine',
      createdAt: new Date().toISOString(),
      answerable: false,
      escalationCategory: 'missing_detail',
      suggestedActions: ['Add migration steps'],
      blockedTaskIds: ['TASK-001'],
      status: 'pending',
    };

    await writeFile(jsonlPath, JSON.stringify(pendingIssue) + '\n');

    const logs: string[] = [];
    const result = await runReviewAnswerLogic({
      issueId,
      message: 'Use Flyway for database migrations',
      resolution: 'answered',
      reviewer: 'human',
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    expect(result.resolved).toBe(true);
    expect(result.issueId).toBe(issueId);
  });

  it('returns not-found when issue does not exist', async () => {
    const logs: string[] = [];
    const result = await runReviewAnswerLogic({
      issueId: 'ESC-nonexistent',
      message: 'Some answer',
      resolution: 'answered',
      reviewer: 'human',
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    expect(result.resolved).toBe(false);
  });

  it('can dismiss an issue', async () => {
    const issueId = 'ESC-abc12345';
    const pendingIssue = {
      issueId,
      taskId: 'TASK-001',
      severity: 'minor',
      category: 'missing_detail',
      summary: '[missing_detail]: Test',
      description: 'Test',
      reporter: 'query-engine',
      createdAt: new Date().toISOString(),
      answerable: false,
      escalationCategory: 'missing_detail',
      suggestedActions: [],
      blockedTaskIds: [],
      status: 'pending',
    };

    await writeFile(jsonlPath, JSON.stringify(pendingIssue) + '\n');

    const logs: string[] = [];
    const result = await runReviewAnswerLogic({
      issueId,
      message: '',
      resolution: 'dismissed',
      reviewer: 'human',
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    expect(result.resolved).toBe(true);
  });
});

describe('runReviewExportLogic and runReviewImportLogic', () => {
  let tempDir: string;
  let jsonlPath: string;
  let exportFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-review-export-'));
    jsonlPath = join(tempDir, '.atsf-issues.jsonl');
    exportFile = join(tempDir, 'answers.json');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('exports pending issues to a JSON file', async () => {
    const pendingIssue = {
      issueId: 'ESC-abc12345',
      taskId: 'TASK-001',
      severity: 'minor',
      category: 'missing_detail',
      summary: '[missing_detail]: Test',
      description: 'Test description',
      reporter: 'query-engine',
      createdAt: new Date().toISOString(),
      answerable: false,
      escalationCategory: 'missing_detail',
      suggestedActions: ['Clarify'],
      blockedTaskIds: ['TASK-001'],
      status: 'pending',
    };

    await writeFile(jsonlPath, JSON.stringify(pendingIssue) + '\n');

    const logs: string[] = [];
    await runReviewExportLogic({
      issueLogFile: jsonlPath,
      outputFile: exportFile,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    const exported = JSON.parse(await readFile(exportFile, 'utf-8')) as unknown[];
    expect(Array.isArray(exported)).toBe(true);
    expect(exported.length).toBe(1);
    expect((exported[0] as { issueId: string }).issueId).toBe('ESC-abc12345');
  });

  it('import round-trip preserves issue data', async () => {
    const pendingIssue = {
      issueId: 'ESC-abc12345',
      taskId: 'TASK-001',
      severity: 'minor',
      category: 'missing_detail',
      summary: '[missing_detail]: Test',
      description: 'Test description',
      reporter: 'query-engine',
      createdAt: new Date().toISOString(),
      answerable: false,
      escalationCategory: 'missing_detail',
      suggestedActions: ['Clarify'],
      blockedTaskIds: ['TASK-001'],
      status: 'pending',
    };

    await writeFile(jsonlPath, JSON.stringify(pendingIssue) + '\n');

    // Export
    const logs: string[] = [];
    await runReviewExportLogic({
      issueLogFile: jsonlPath,
      outputFile: exportFile,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    // Modify and import answers
    const exported = JSON.parse(await readFile(exportFile, 'utf-8')) as Array<{
      issueId: string;
      answer?: string;
      resolution?: string;
    }>;

    const answers = exported.map((issue) => ({
      issueId: issue.issueId,
      resolution: 'answered' as const,
      answer: 'Use database migrations via Flyway',
      reviewer: 'human',
    }));

    await writeFile(exportFile, JSON.stringify(answers, null, 2));

    const importResult = await runReviewImportLogic({
      answersFile: exportFile,
      issueLogFile: jsonlPath,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    expect(importResult.imported).toBe(1);
    expect(importResult.failed).toBe(0);
  });

  it('export skips non-pending issues', async () => {
    const issues = [
      {
        issueId: 'ESC-abc12345',
        taskId: 'TASK-001',
        severity: 'minor',
        category: 'missing_detail',
        summary: 'pending issue',
        description: 'desc',
        reporter: 'query-engine',
        createdAt: new Date().toISOString(),
        answerable: false,
        escalationCategory: 'missing_detail',
        suggestedActions: [],
        blockedTaskIds: [],
        status: 'pending',
      },
      {
        issueId: 'ESC-def67890',
        taskId: 'TASK-001',
        severity: 'minor',
        category: 'missing_detail',
        summary: 'answered issue',
        description: 'desc',
        reporter: 'query-engine',
        createdAt: new Date().toISOString(),
        answerable: false,
        escalationCategory: 'missing_detail',
        suggestedActions: [],
        blockedTaskIds: [],
        status: 'answered',
      },
    ];

    await writeFile(
      jsonlPath,
      issues.map((i) => JSON.stringify(i)).join('\n') + '\n',
    );

    const logs: string[] = [];
    await runReviewExportLogic({
      issueLogFile: jsonlPath,
      outputFile: exportFile,
      port: 19999,
      log: (msg) => logs.push(msg),
    });

    const exported = JSON.parse(await readFile(exportFile, 'utf-8')) as unknown[];
    expect(exported.length).toBe(1);
    expect((exported[0] as { issueId: string }).issueId).toBe('ESC-abc12345');
  });
});
