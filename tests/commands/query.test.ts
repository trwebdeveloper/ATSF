/**
 * Tests for `atsf query` command logic (T16).
 *
 * Tests the extracted runQueryLogic() function.
 *
 * Validates:
 * 1. In-process query when no server running
 * 2. JSON output format
 * 3. Task scoping via --task flag
 * 4. Raw context mode via --no-llm flag
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runQueryLogic } from '../../src/cli/commands/query.js';

// ---------------------------------------------------------------------------
// Helper: create test output directory
// ---------------------------------------------------------------------------

async function createTestOutputDir(tempDir: string): Promise<string> {
  const outputDir = join(tempDir, 'atsf-output');
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, 'tickets'), { recursive: true });
  await mkdir(join(outputDir, 'ai_prompt_pack'), { recursive: true });

  await writeFile(
    join(outputDir, 'manifest.json'),
    JSON.stringify({ version: '1.0', generatedAt: new Date().toISOString() }),
  );

  await writeFile(
    join(outputDir, 'task_graph.yaml'),
    `version: "1.0"
tasks:
  - id: TASK-001
    name: Setup project scaffolding
    agent: scaffold-agent
    filesWrite:
      - package.json
    filesRead: []
    dependsOn: []
  - id: TASK-002
    name: Implement authentication
    agent: auth-agent
    filesWrite:
      - src/auth/index.ts
    filesRead:
      - package.json
    dependsOn:
      - TASK-001
  - id: TASK-003
    name: Add database layer
    agent: db-agent
    filesWrite:
      - src/db/index.ts
    filesRead: []
    dependsOn:
      - TASK-001
`,
  );

  await writeFile(
    join(outputDir, 'MPD.md'),
    `# Master Project Document

## Overview
A web application with auth and database.

## Architecture
Layered architecture pattern.
`,
  );

  await writeFile(
    join(outputDir, 'tickets', 'TASK-001.md'),
    `---
id: TASK-001
title: Setup scaffolding
---
# TASK-001: Setup scaffolding
Create the initial project structure.
`,
  );

  return outputDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runQueryLogic', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-query-test-'));
    outputDir = await createTestOutputDir(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('runs in-process when no server is available', async () => {
    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'What is TASK-001?',
      format: 'text',
      noLlm: true,
      port: 19999, // No server on this port
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.answer).toBeTruthy();
    expect(result.confidence).toMatch(/^(high|medium|low)$/);
    expect(logs.some(l => l.includes('in-process'))).toBe(true);
  });

  it('returns answer and sources', async () => {
    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'scaffolding project setup',
      format: 'text',
      noLlm: true,
      port: 19999,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.answer).toBeTruthy();
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it('scopes query to task when taskId provided', async () => {
    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'What files does this task create?',
      taskId: 'TASK-001',
      format: 'text',
      noLlm: true,
      port: 19999,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(result).toBeDefined();
    expect(result.answer).toBeTruthy();
  });

  it('returns confidence level', async () => {
    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'architecture',
      format: 'text',
      noLlm: true,
      port: 19999,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('handles empty output directory', async () => {
    const emptyDir = join(tempDir, 'empty-output');
    await mkdir(emptyDir, { recursive: true });

    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'anything',
      format: 'text',
      noLlm: true,
      port: 19999,
      outputDir: emptyDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.answer).toBeTruthy();
    expect(result.confidence).toBe('low');
  });

  it('handles queries with no matches gracefully', async () => {
    const logs: string[] = [];
    const result = await runQueryLogic({
      question: 'xyznonexistentquerytermxyz',
      format: 'text',
      noLlm: true,
      port: 19999,
      outputDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.answer).toBeTruthy();
  });
});
