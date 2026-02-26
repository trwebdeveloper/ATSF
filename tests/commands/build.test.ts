/**
 * Tests for `atsf build` command logic (T15).
 *
 * Tests the extracted runBuildLogic() function.
 *
 * Validates:
 * 1. Runs without error with valid input
 * 2. Returns valid OrchestratorConfig
 * 3. --output-dir flag works
 * 4. --provider flag selects correct provider
 * 5. --concurrency flag controls parallelism
 * 6. Error handling for missing input
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuildLogic } from '../../src/cli/commands/build.js';

// ---------------------------------------------------------------------------
// Mock config loader
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopLog(_msg: string): void {
  // discard
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runBuildLogic', () => {
  let tempDir: string;
  let inputFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-build-test-'));
    inputFile = join(tempDir, 'project.md');
    await writeFile(inputFile, '# Test Project\nBuild a web app.');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs successfully with valid input', async () => {
    const logs: string[] = [];
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Build started'))).toBe(true);
    expect(logs.some(l => l.includes('Build complete'))).toBe(true);
    expect(orchConfig).toBeDefined();
  });

  it('returns OrchestratorConfig with correct inputPath', async () => {
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: noopLog,
    });

    expect(orchConfig.inputPath).toBe(inputFile);
  });

  it('accepts provider option', async () => {
    const logs: string[] = [];
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      provider: 'openrouter',
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(orchConfig.providers).toContain('openrouter');
  });

  it('accepts concurrency option', async () => {
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      concurrency: 10,
      outputDir: tempDir,
      log: noopLog,
    });

    expect(orchConfig.maxConcurrency).toBe(10);
  });

  it('accepts output-dir option', async () => {
    const outputDir = join(tempDir, 'build-output');
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      outputDir,
      log: noopLog,
    });

    expect(orchConfig.workspaceRoot).toBe(outputDir);
  });

  it('reports success status in output', async () => {
    const logs: string[] = [];
    await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('success'))).toBe(true);
  });

  it('fails with meaningful error when input file is missing', async () => {
    await expect(
      runBuildLogic({
        inputPath: '/nonexistent/path.md',
        outputDir: tempDir,
        log: noopLog,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('uses default concurrency from config when not specified', async () => {
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: noopLog,
    });

    expect(orchConfig.maxConcurrency).toBe(5);
  });

  it('accepts --mode option and logs mode', async () => {
    const logs: string[] = [];
    const orchConfig = await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      mode: 'premium',
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Mode: premium'))).toBe(true);
    expect(orchConfig.debateProposerCount).toBe(3);
    expect(orchConfig.debateRounds).toBe(5);
    expect(orchConfig.debateConvergenceThreshold).toBe(0.9);
  });

  it('uses config mode when --mode not specified', async () => {
    const logs: string[] = [];
    await runBuildLogic({
      inputPath: inputFile,
      outputDir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Mode: free'))).toBe(true);
  });
});
