/**
 * Tests for `atsf plan` command logic (T15).
 *
 * Tests the extracted runPlanLogic() function.
 *
 * Validates:
 * 1. Runs without error with valid input
 * 2. --output-dir flag directs output
 * 3. --provider flag selects provider
 * 4. Error handling for missing input
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlanLogic } from '../../src/cli/commands/plan.js';

// ---------------------------------------------------------------------------
// Mock config loader to avoid real cosmiconfig search
// ---------------------------------------------------------------------------

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    provider: { default: 'openrouter' },
    mode: 'free',
    debate: { rounds: 3, engine: 'judge', convergenceThreshold: 0.8 },
    build: { maxConcurrency: 5, timeout: 300000 },
    gate: { threshold: 0.8, autoFix: true, maxFixRounds: 3, reporter: 'console', gates: {}, custom: [] },
    budget: {},
    output: { directory: './atsf-output', formats: ['task_graph'] },
    serve: { port: 4567, host: '127.0.0.1', cors: true, llmEnabled: true, maxChunks: 10, issueLogFile: '.atsf-issues.jsonl', watchDebounceMs: 1000 },
    review: { autoOpenEditor: true, defaultSort: 'severity', pageSize: 25 },
  }),
}));

vi.mock('../../src/events/event-bus.js', () => ({
  createEventBus: vi.fn().mockReturnValue({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    once: vi.fn(),
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

describe('runPlanLogic', () => {
  let tempDir: string;
  let inputFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-plan-test-'));
    inputFile = join(tempDir, 'project.md');
    await writeFile(inputFile, '# Test Project\nA simple test project description.');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs successfully with valid input', async () => {
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Plan generation started'))).toBe(true);
    expect(logs.some(l => l.includes('Plan generation complete'))).toBe(true);
  });

  it('accepts provider option', async () => {
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      provider: 'openrouter',
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Plan generation complete'))).toBe(true);
  });

  it('accepts output-dir option', async () => {
    const outputDir = join(tempDir, 'custom-output');
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes(outputDir))).toBe(true);
  });

  it('fails with meaningful error when input file is missing', async () => {
    await expect(
      runPlanLogic({
        inputPath: '/nonexistent/path.md',
        log: noopLog,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('logs provider information', async () => {
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Provider:'))).toBe(true);
  });

  it('accepts --mode option and logs mode', async () => {
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      mode: 'premium',
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Mode: premium'))).toBe(true);
  });

  it('uses config mode when --mode not specified', async () => {
    const logs: string[] = [];
    await runPlanLogic({
      inputPath: inputFile,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Mode: free'))).toBe(true);
  });
});
