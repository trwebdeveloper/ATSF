/**
 * Tests for `atsf debate` command logic (T15).
 *
 * Tests the extracted runDebateLogic() function.
 *
 * Validates:
 * 1. Runs without error with valid plan file
 * 2. --rounds flag controls debate rounds
 * 3. --engine flag selects debate engine
 * 4. --output flag writes debate results
 * 5. Error handling for missing plan file
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDebateLogic } from '../../src/cli/commands/debate.js';

// ---------------------------------------------------------------------------
// Mock config loader
// ---------------------------------------------------------------------------

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    provider: { default: 'openrouter' },
    debate: { rounds: 3, engine: 'judge', convergenceThreshold: 0.8 },
    build: { maxConcurrency: 5, timeout: 300000 },
    gate: { threshold: 0.8, autoFix: true, maxFixRounds: 3, reporter: 'console', gates: {}, custom: [] },
    budget: {},
    output: { directory: './atsf-output', formats: ['task_graph'] },
    serve: { port: 4567, host: '127.0.0.1', cors: true, llmEnabled: true, maxChunks: 10, issueLogFile: '.atsf-issues.jsonl', watchDebounceMs: 1000 },
    review: { autoOpenEditor: true, defaultSort: 'severity', pageSize: 25 },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopLog(_msg: string): void {
  // discard
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDebateLogic', () => {
  let tempDir: string;
  let planFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-debate-test-'));
    planFile = join(tempDir, 'plan.yaml');
    await writeFile(planFile, 'tasks:\n  - id: T1\n    title: Test task');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs successfully with valid plan file', async () => {
    const logs: string[] = [];
    await runDebateLogic({
      planPath: planFile,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Debate started'))).toBe(true);
    expect(logs.some(l => l.includes('Debate complete'))).toBe(true);
  });

  it('accepts --rounds option', async () => {
    const logs: string[] = [];
    await runDebateLogic({
      planPath: planFile,
      rounds: 5,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Rounds: 5'))).toBe(true);
  });

  it('accepts --engine option', async () => {
    const logs: string[] = [];
    await runDebateLogic({
      planPath: planFile,
      engine: 'judge',
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Engine: judge'))).toBe(true);
  });

  it('writes output file when --output is specified', async () => {
    const outputFile = join(tempDir, 'debate-results.json');
    await runDebateLogic({
      planPath: planFile,
      output: outputFile,
      log: noopLog,
    });

    const content = await readFile(outputFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe('complete');
    expect(parsed).toHaveProperty('engine');
    expect(parsed).toHaveProperty('rounds');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('uses default of 3 rounds when not specified', async () => {
    const logs: string[] = [];
    await runDebateLogic({
      planPath: planFile,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Rounds: 3'))).toBe(true);
  });

  it('fails with meaningful error when plan file is missing', async () => {
    await expect(
      runDebateLogic({
        planPath: '/nonexistent/plan.yaml',
        log: noopLog,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
