/**
 * Tests for `atsf init` command logic (T15).
 *
 * Tests the extracted runInitLogic() function and createDefaultConfig().
 * This avoids ESM issues with @oclif/test and oclif Command internals.
 *
 * Validates:
 * 1. Creates default config file in target directory
 * 2. --force overwrites existing config
 * 3. Fails if config already exists without --force
 * 4. --provider flag sets default provider
 * 5. --output-dir flag sets output directory in config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInitLogic, createDefaultConfig } from '../../src/cli/commands/init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noopLog(_msg: string): void {
  // discard
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDefaultConfig', () => {
  it('returns config with default provider', () => {
    const config = createDefaultConfig({});
    expect(config.provider).toEqual({ default: 'openrouter' });
  });

  it('allows overriding provider', () => {
    const config = createDefaultConfig({ provider: 'claude-code' });
    expect((config.provider as Record<string, unknown>).default).toBe('claude-code');
  });

  it('allows overriding output directory', () => {
    const config = createDefaultConfig({ outputDir: './custom' });
    expect((config.output as Record<string, unknown>).directory).toBe('./custom');
  });

  it('includes debate, build, gate, and output sections', () => {
    const config = createDefaultConfig({});
    expect(config).toHaveProperty('debate');
    expect(config).toHaveProperty('build');
    expect(config).toHaveProperty('gate');
    expect(config).toHaveProperty('output');
  });

  it('defaults mode to free', () => {
    const config = createDefaultConfig({});
    expect(config.mode).toBe('free');
  });

  it('allows overriding mode', () => {
    const config = createDefaultConfig({ mode: 'premium' });
    expect(config.mode).toBe('premium');
  });
});

describe('runInitLogic', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'atsf-init-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates default config file', async () => {
    const logs: string[] = [];
    await runInitLogic({
      dir: tempDir,
      force: false,
      log: (msg) => logs.push(msg),
    });

    // Verify config file was created
    const configPath = join(tempDir, '.atsfrc.json');
    const configStat = await stat(configPath);
    expect(configStat.isFile()).toBe(true);

    // Verify config content is valid JSON
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('provider');

    // Verify log output
    expect(logs.some(l => l.includes('Initialized'))).toBe(true);
  });

  it('creates workspace output directory', async () => {
    await runInitLogic({
      dir: tempDir,
      force: false,
      log: noopLog,
    });

    // Default output dir should be created
    const outputDir = join(tempDir, 'atsf-output');
    const outputStat = await stat(outputDir);
    expect(outputStat.isDirectory()).toBe(true);
  });

  it('fails if config already exists without --force', async () => {
    // First init
    await runInitLogic({
      dir: tempDir,
      force: false,
      log: noopLog,
    });

    // Second init without --force
    await expect(
      runInitLogic({
        dir: tempDir,
        force: false,
        log: noopLog,
      }),
    ).rejects.toThrow('already exists');
  });

  it('overwrites existing config with --force', async () => {
    // First init
    await runInitLogic({
      dir: tempDir,
      force: false,
      log: noopLog,
    });

    // Second init with --force
    const logs: string[] = [];
    await runInitLogic({
      dir: tempDir,
      force: true,
      log: (msg) => logs.push(msg),
    });

    expect(logs.some(l => l.includes('Initialized'))).toBe(true);
  });

  it('--provider sets default provider in config', async () => {
    await runInitLogic({
      dir: tempDir,
      force: false,
      provider: 'claude-code',
      log: noopLog,
    });

    const configPath = join(tempDir, '.atsfrc.json');
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.provider.default).toBe('claude-code');
  });

  it('--outputDir sets output directory in config', async () => {
    const customOutput = './custom-output';
    await runInitLogic({
      dir: tempDir,
      force: false,
      outputDir: customOutput,
      log: noopLog,
    });

    const configPath = join(tempDir, '.atsfrc.json');
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.output.directory).toBe(customOutput);
  });

  it('--mode sets mode in config file', async () => {
    await runInitLogic({
      dir: tempDir,
      force: false,
      mode: 'balanced',
      log: noopLog,
    });

    const configPath = join(tempDir, '.atsfrc.json');
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.mode).toBe('balanced');
  });

  it('defaults mode to free in config file', async () => {
    await runInitLogic({
      dir: tempDir,
      force: false,
      log: noopLog,
    });

    const configPath = join(tempDir, '.atsfrc.json');
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.mode).toBe('free');
  });
});
