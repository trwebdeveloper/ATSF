/**
 * Tests for `atsf emit` command logic (T15).
 *
 * Tests the extracted runEmitLogic() function.
 *
 * Validates:
 * 1. Runs without error
 * 2. --output-dir flag directs output
 * 3. --format flag selects artifact formats
 * 4. Logs completion message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEmitLogic } from '../../src/cli/commands/emit.js';

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
    output: { directory: './atsf-output', formats: ['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack'] },
    serve: { port: 4567, host: '127.0.0.1', cors: true, llmEnabled: true, maxChunks: 10, issueLogFile: '.atsf-issues.jsonl', watchDebounceMs: 1000 },
    review: { autoOpenEditor: true, defaultSort: 'severity', pageSize: 25 },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runEmitLogic', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-emit-test-'));
    const inputDir = join(tempDir, 'atsf-output');
    await mkdir(inputDir, { recursive: true });
    await writeFile(join(inputDir, 'task_graph.yaml'), 'version: "1.0"\ntasks: []');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs successfully', async () => {
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Emit started'))).toBe(true);
    expect(logs.some(l => l.includes('Emit complete'))).toBe(true);
  });

  it('accepts output-dir option', async () => {
    const outputDir = join(tempDir, 'emit-output');
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes(outputDir))).toBe(true);
  });

  it('accepts format option', async () => {
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      formats: ['task_graph'],
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('task_graph'))).toBe(true);
  });

  it('accepts multiple formats', async () => {
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      formats: ['task_graph', 'mpd'],
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('task_graph'))).toBe(true);
    expect(logs.some(l => l.includes('mpd'))).toBe(true);
  });

  it('reports completion in output', async () => {
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('complete'))).toBe(true);
  });

  it('uses default formats from config when not specified', async () => {
    const logs: string[] = [];
    await runEmitLogic({
      dir: tempDir,
      log: (msg) => logs.push(msg),
    });

    // Default config has all formats
    const formatLine = logs.find(l => l.includes('Formats:'));
    expect(formatLine).toBeDefined();
    expect(formatLine).toContain('task_graph');
  });
});
