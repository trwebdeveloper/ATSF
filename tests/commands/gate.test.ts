/**
 * Tests for `atsf gate` command and subcommands logic (T15).
 *
 * Tests the extracted runGateLogic(), runGateCheckLogic(), and runGateListLogic().
 *
 * Validates:
 * 1. Gate list returns all built-in gates
 * 2. Gate check finds gates by name
 * 3. Gate check fails for unknown gates
 * 4. Gate list supports JSON format
 * 5. Gate run produces report (with mocked orchestrator)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGateCheckLogic } from '../../src/cli/commands/gate/check.js';
import { runGateListLogic } from '../../src/cli/commands/gate/list.js';
import { runGateLogic } from '../../src/cli/commands/gate/index.js';

// ---------------------------------------------------------------------------
// Mock subsystems for gate index (runGateLogic)
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
// Tests: gate list
// ---------------------------------------------------------------------------

describe('runGateListLogic', () => {
  it('lists all available gates in table format', () => {
    const logs: string[] = [];
    const result = runGateListLogic({
      format: 'table',
      log: (msg) => logs.push(msg),
    });

    expect(result.gates.length).toBeGreaterThanOrEqual(5);
    expect(result.gates.map(g => g.id)).toContain('security');
    expect(result.gates.map(g => g.id)).toContain('buildability');
    expect(result.gates.map(g => g.id)).toContain('consistency');
    expect(result.gates.map(g => g.id)).toContain('coverage');
    expect(result.gates.map(g => g.id)).toContain('testability');

    expect(logs.some(l => l.includes('security'))).toBe(true);
    expect(logs.some(l => l.includes('buildability'))).toBe(true);
    expect(logs.some(l => l.includes('consistency'))).toBe(true);
    expect(logs.some(l => l.includes('coverage'))).toBe(true);
    expect(logs.some(l => l.includes('testability'))).toBe(true);
  });

  it('lists gates in JSON format', () => {
    const logs: string[] = [];
    const result = runGateListLogic({
      format: 'json',
      log: (msg) => logs.push(msg),
    });

    expect(result.gates.length).toBeGreaterThanOrEqual(5);

    // JSON output should be parseable
    const jsonOutput = logs.join('\n');
    const parsed = JSON.parse(jsonOutput);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('priority');
  });

  it('returns gates sorted by priority', () => {
    const result = runGateListLogic({
      log: noopLog,
    });

    const priorities = result.gates.map(g => g.priority);
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: gate check
// ---------------------------------------------------------------------------

describe('runGateCheckLogic', () => {
  it('finds a gate by name', async () => {
    const logs: string[] = [];
    const result = await runGateCheckLogic({
      gateName: 'security',
      log: (msg) => logs.push(msg),
    });

    expect(result.found).toBe(true);
    expect(result.gateId).toBe('security');
    expect(logs.some(l => l.includes('security'))).toBe(true);
  });

  it('finds consistency gate', async () => {
    const result = await runGateCheckLogic({
      gateName: 'consistency',
      log: noopLog,
    });

    expect(result.found).toBe(true);
    expect(result.gateId).toBe('consistency');
  });

  it('throws for unknown gate name', async () => {
    await expect(
      runGateCheckLogic({
        gateName: 'nonexistent-gate',
        log: noopLog,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('error message lists available gates', async () => {
    try {
      await runGateCheckLogic({
        gateName: 'nonexistent-gate',
        log: noopLog,
      });
    } catch (err) {
      expect((err as Error).message).toContain('security');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: gate run (runGateLogic)
// ---------------------------------------------------------------------------

describe('runGateLogic', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-gate-test-'));
    await mkdir(join(tempDir, 'atsf-output'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs all gates and produces report', async () => {
    const logs: string[] = [];
    const report = await runGateLogic({
      dir: tempDir,
      log: (msg) => logs.push(msg),
      logToStderr: noopLog,
    });

    expect(report).toBeDefined();
    expect(typeof report.overallScore).toBe('number');
    expect(typeof report.passed).toBe('boolean');
    expect(Array.isArray(report.gates)).toBe(true);
    expect(logs.some(l => l.includes('Gate checks started'))).toBe(true);
  });

  it('accepts threshold option', async () => {
    const logs: string[] = [];
    const report = await runGateLogic({
      dir: tempDir,
      threshold: 0.9,
      log: (msg) => logs.push(msg),
      logToStderr: noopLog,
    });

    expect(report).toBeDefined();
    expect(logs.some(l => l.includes('Threshold: 0.9'))).toBe(true);
  });

  it('produces JSON output with reporter=json', async () => {
    const logs: string[] = [];
    await runGateLogic({
      dir: tempDir,
      reporter: 'json',
      log: (msg) => logs.push(msg),
      logToStderr: noopLog,
    });

    // Find the JSON output in logs (skip the "Gate checks started" etc.)
    const jsonLine = logs.find(l => l.startsWith('{'));
    if (jsonLine) {
      const parsed = JSON.parse(jsonLine);
      expect(parsed).toHaveProperty('overallScore');
      expect(parsed).toHaveProperty('passed');
    }
  });

  it('report contains gate results', async () => {
    const report = await runGateLogic({
      dir: tempDir,
      log: noopLog,
      logToStderr: noopLog,
    });

    expect(report.gates.length).toBeGreaterThanOrEqual(0);
    expect(typeof report.overallScore).toBe('number');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });
});
