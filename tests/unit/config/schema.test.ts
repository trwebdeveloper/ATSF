import { describe, it, expect } from 'vitest';
import { ATSFConfigSchema } from '../../../src/config/schema.js';
import type { ATSFConfig } from '../../../src/config/schema.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const fixturesDir = resolve(import.meta.dirname, '../../fixtures/sample-config');

function loadYamlFixture(name: string): unknown {
  const raw = readFileSync(resolve(fixturesDir, name), 'utf-8');
  return parseYaml(raw);
}

describe('ATSFConfigSchema', () => {
  describe('valid full config', () => {
    it('passes schema validation with all fields specified', () => {
      const raw = loadYamlFixture('valid-config.yaml');
      const result = ATSFConfigSchema.safeParse(raw);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const config: ATSFConfig = result.data;
      expect(config.provider.default).toBe('openrouter');
      expect(config.provider.openrouter?.apiKey).toBe('test-api-key-123');
      expect(config.provider.openrouter?.defaultModel).toBe('anthropic/claude-sonnet-4');
      expect(config.provider.claudeCode?.binaryPath).toBe('/usr/local/bin/claude');
      expect(config.provider.claudeCode?.maxTurns).toBe(10);

      expect(config.debate.rounds).toBe(5);
      expect(config.debate.engine).toBe('round-robin');
      expect(config.debate.convergenceThreshold).toBe(0.9);

      expect(config.build.maxConcurrency).toBe(8);
      expect(config.build.timeout).toBe(600000);

      expect(config.gate.threshold).toBe(0.85);
      expect(config.gate.autoFix).toBe(false);
      expect(config.gate.maxFixRounds).toBe(5);
      expect(config.gate.reporter).toBe('json');
      expect(config.gate.gates.coverage.enabled).toBe(true);
      expect(config.gate.gates.coverage.threshold).toBe(0.7);
      expect(config.gate.gates.coverage.autoFix).toBe(true);
      expect(config.gate.gates.coverage.rules?.['line-coverage']?.enabled).toBe(true);
      expect(config.gate.gates.coverage.rules?.['line-coverage']?.severity).toBe('error');
      expect(config.gate.gates.consistency.enabled).toBe(true);
      expect(config.gate.gates.consistency.threshold).toBe(0.9);

      expect(config.budget.perRunUsd).toBe(10.0);
      expect(config.budget.perDayUsd).toBe(50.0);
      expect(config.budget.perMonthUsd).toBe(500.0);

      expect(config.output.directory).toBe('./my-output');
      expect(config.output.formats).toEqual(['task_graph', 'repo_blueprint', 'mpd']);

      expect(config.serve.port).toBe(8080);
      expect(config.serve.host).toBe('0.0.0.0');
      expect(config.serve.cors).toBe(false);
      expect(config.serve.llmEnabled).toBe(false);
      expect(config.serve.queryModel).toBe('anthropic/claude-haiku-4');
      expect(config.serve.maxChunks).toBe(20);
      expect(config.serve.issueLogFile).toBe('custom-issues.jsonl');
      expect(config.serve.watchDebounceMs).toBe(2000);

      expect(config.review.editor).toBe('vim');
      expect(config.review.autoOpenEditor).toBe(false);
      expect(config.review.defaultSort).toBe('timestamp');
      expect(config.review.pageSize).toBe(50);
    });
  });

  describe('minimal config applies all defaults', () => {
    it('applies defaults for all optional/defaulted fields', () => {
      const raw = loadYamlFixture('minimal-config.yaml');
      const result = ATSFConfigSchema.safeParse(raw);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const config: ATSFConfig = result.data;

      // provider defaults
      expect(config.provider.default).toBe('openrouter');
      expect(config.provider.openrouter).toBeUndefined();
      expect(config.provider.claudeCode).toBeUndefined();

      // debate defaults
      expect(config.debate.rounds).toBe(3);
      expect(config.debate.engine).toBe('judge');
      expect(config.debate.convergenceThreshold).toBe(0.8);

      // build defaults
      expect(config.build.maxConcurrency).toBe(5);
      expect(config.build.timeout).toBe(300_000);

      // gate defaults
      expect(config.gate.threshold).toBe(0.8);
      expect(config.gate.autoFix).toBe(true);
      expect(config.gate.maxFixRounds).toBe(3);
      expect(config.gate.reporter).toBe('console');
      expect(config.gate.gates).toEqual({});
      expect(config.gate.custom).toEqual([]);

      // budget defaults
      expect(config.budget.perRunUsd).toBeUndefined();
      expect(config.budget.perDayUsd).toBeUndefined();
      expect(config.budget.perMonthUsd).toBeUndefined();

      // output defaults
      expect(config.output.directory).toBe('./atsf-output');
      expect(config.output.formats).toEqual([
        'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
      ]);

      // serve defaults
      expect(config.serve.port).toBe(4567);
      expect(config.serve.host).toBe('127.0.0.1');
      expect(config.serve.cors).toBe(true);
      expect(config.serve.llmEnabled).toBe(true);
      expect(config.serve.queryModel).toBeUndefined();
      expect(config.serve.maxChunks).toBe(10);
      expect(config.serve.issueLogFile).toBe('.atsf-issues.jsonl');
      expect(config.serve.watchDebounceMs).toBe(1000);

      // review defaults
      expect(config.review.editor).toBeUndefined();
      expect(config.review.autoOpenEditor).toBe(true);
      expect(config.review.defaultSort).toBe('severity');
      expect(config.review.pageSize).toBe(25);
    });
  });

  describe('invalid config throws ZodError with path information', () => {
    it('rejects invalid provider enum', () => {
      const raw = loadYamlFixture('invalid-config.yaml');
      const result = ATSFConfigSchema.safeParse(raw);

      expect(result.success).toBe(false);
      if (result.success) return;

      // Should have multiple issues
      expect(result.error.issues.length).toBeGreaterThan(0);

      // Check that path information is present
      const paths = result.error.issues.map(i => i.path.join('.'));
      expect(paths.some(p => p.includes('provider'))).toBe(true);
    });

    it('rejects unknown top-level fields (strict mode)', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        unknownField: 'should be rejected',
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      // Zod v4 reports unrecognized keys via the `keys` field in the issue
      const unrecognizedIssue = result.error.issues.find(
        i => i.code === 'unrecognized_keys',
      );
      expect(unrecognizedIssue).toBeDefined();
      expect((unrecognizedIssue as { keys: string[] }).keys).toContain('unknownField');
    });
  });

  describe('build.maxConcurrency', () => {
    it('is accepted and defaulted to 5', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.build.maxConcurrency).toBe(5);
    });

    it('accepts custom value within range', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        build: { maxConcurrency: 20 },
      });

      expect(result.build.maxConcurrency).toBe(20);
    });

    it('rejects value below minimum', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        build: { maxConcurrency: 0 },
      });

      expect(result.success).toBe(false);
    });

    it('rejects value above maximum', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        build: { maxConcurrency: 51 },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('gate nested config with per-gate overrides', () => {
    it('works with per-gate threshold overrides', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        gate: {
          threshold: 0.8,
          gates: {
            coverage: {
              enabled: true,
              threshold: 0.7,
            },
            security: {
              enabled: true,
              threshold: 0.95,
              rules: {
                'secret-detection': {
                  enabled: true,
                  severity: 'error',
                },
              },
            },
          },
        },
      });

      expect(result.gate.threshold).toBe(0.8);
      expect(result.gate.gates.coverage.threshold).toBe(0.7);
      expect(result.gate.gates.security.threshold).toBe(0.95);
      expect(result.gate.gates.security.rules?.['secret-detection']?.severity).toBe('error');
    });

    it('accepts empty gates record', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        gate: { gates: {} },
      });

      expect(result.gate.gates).toEqual({});
    });

    it('defaults gate.autoFix to true', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.gate.autoFix).toBe(true);
    });
  });

  describe('serve config', () => {
    it('applies defaults for port, host, issueLogFile', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.serve.port).toBe(4567);
      expect(result.serve.host).toBe('127.0.0.1');
      expect(result.serve.issueLogFile).toBe('.atsf-issues.jsonl');
    });

    it('rejects port below 1024', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        serve: { port: 80 },
      });

      expect(result.success).toBe(false);
    });

    it('rejects port above 65535', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        serve: { port: 70000 },
      });

      expect(result.success).toBe(false);
    });

    it('accepts custom serve config', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        serve: {
          port: 9000,
          host: '0.0.0.0',
          cors: false,
          llmEnabled: false,
          maxChunks: 25,
          issueLogFile: 'my-issues.jsonl',
          watchDebounceMs: 500,
        },
      });

      expect(result.serve.port).toBe(9000);
      expect(result.serve.host).toBe('0.0.0.0');
      expect(result.serve.cors).toBe(false);
      expect(result.serve.llmEnabled).toBe(false);
      expect(result.serve.maxChunks).toBe(25);
    });
  });

  describe('provider config', () => {
    it('defaults provider.default to openrouter', () => {
      const result = ATSFConfigSchema.parse({
        provider: {},
      });

      expect(result.provider.default).toBe('openrouter');
    });

    it('accepts claude-code as default provider', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'claude-code' },
      });

      expect(result.provider.default).toBe('claude-code');
    });

    it('defaults claudeCode.binaryPath to "claude"', () => {
      const result = ATSFConfigSchema.parse({
        provider: {
          default: 'claude-code',
          claudeCode: {},
        },
      });

      expect(result.provider.claudeCode?.binaryPath).toBe('claude');
      expect(result.provider.claudeCode?.maxTurns).toBe(5);
    });

    it('defaults openrouter.defaultModel to anthropic/claude-sonnet-4', () => {
      const result = ATSFConfigSchema.parse({
        provider: {
          default: 'openrouter',
          openrouter: {},
        },
      });

      expect(result.provider.openrouter?.defaultModel).toBe('anthropic/claude-sonnet-4');
    });
  });

  describe('review config', () => {
    it('applies review defaults', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.review.autoOpenEditor).toBe(true);
      expect(result.review.defaultSort).toBe('severity');
      expect(result.review.pageSize).toBe(25);
      expect(result.review.editor).toBeUndefined();
    });
  });

  describe('output config', () => {
    it('defaults to all format types', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.output.formats).toEqual([
        'task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack',
      ]);
    });

    it('accepts subset of formats', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        output: { formats: ['task_graph', 'mpd'] },
      });

      expect(result.output.formats).toEqual(['task_graph', 'mpd']);
    });

    it('rejects invalid format names', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        output: { formats: ['invalid_format'] },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('budget config', () => {
    it('rejects non-positive budget values', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        budget: { perRunUsd: -5 },
      });

      expect(result.success).toBe(false);
    });

    it('accepts valid budget values', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        budget: { perRunUsd: 10, perDayUsd: 50 },
      });

      expect(result.budget.perRunUsd).toBe(10);
      expect(result.budget.perDayUsd).toBe(50);
    });
  });

  describe('debate config edge cases', () => {
    it('rejects rounds > 10', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        debate: { rounds: 11 },
      });

      expect(result.success).toBe(false);
    });

    it('rejects convergenceThreshold > 1', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        debate: { convergenceThreshold: 1.5 },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('debate.models per-role model config', () => {
    it('accepts models with all three roles specified', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        debate: {
          models: {
            proposer: 'anthropic/claude-opus-4',
            critic: 'google/gemini-2.5-pro',
            judge: 'anthropic/claude-sonnet-4',
          },
        },
      });

      expect(result.debate.models?.proposer).toBe('anthropic/claude-opus-4');
      expect(result.debate.models?.critic).toBe('google/gemini-2.5-pro');
      expect(result.debate.models?.judge).toBe('anthropic/claude-sonnet-4');
    });

    it('accepts models with partial roles specified', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
        debate: {
          models: { proposer: 'anthropic/claude-opus-4' },
        },
      });

      expect(result.debate.models?.proposer).toBe('anthropic/claude-opus-4');
      expect(result.debate.models?.critic).toBeUndefined();
      expect(result.debate.models?.judge).toBeUndefined();
    });

    it('defaults models to undefined when not specified', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });

      expect(result.debate.models).toBeUndefined();
    });

    it('rejects unknown keys in models (strict mode)', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        debate: {
          models: { proposer: 'x', unknown: 'y' },
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('mode config', () => {
    it('defaults mode to free', () => {
      const result = ATSFConfigSchema.parse({
        provider: { default: 'openrouter' },
      });
      expect(result.mode).toBe('free');
    });

    it('accepts all four mode values', () => {
      for (const mode of ['free', 'budget', 'balanced', 'premium']) {
        const result = ATSFConfigSchema.parse({
          provider: { default: 'openrouter' },
          mode,
        });
        expect(result.mode).toBe(mode);
      }
    });

    it('rejects invalid mode values', () => {
      const result = ATSFConfigSchema.safeParse({
        provider: { default: 'openrouter' },
        mode: 'ultra',
      });
      expect(result.success).toBe(false);
    });
  });
});
