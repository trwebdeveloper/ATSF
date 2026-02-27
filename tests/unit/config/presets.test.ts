import { describe, it, expect } from 'vitest';
import {
  MODE_PRESETS,
  resolveMode,
  type ModeName,
  type ModePreset,
} from '../../../src/config/presets.js';

describe('MODE_PRESETS', () => {
  it('defines exactly 4 presets', () => {
    expect(Object.keys(MODE_PRESETS)).toHaveLength(4);
    expect(Object.keys(MODE_PRESETS)).toEqual(['free', 'budget', 'balanced', 'premium']);
  });

  it.each(['free', 'budget', 'balanced', 'premium'] as ModeName[])(
    '%s preset has all required fields',
    (mode) => {
      const preset: ModePreset = MODE_PRESETS[mode];
      expect(preset.models.proposer).toBeTruthy();
      expect(preset.models.critic).toBeTruthy();
      expect(preset.models.judge).toBeTruthy();
      expect(preset.rounds).toBeGreaterThanOrEqual(1);
      expect(preset.rounds).toBeLessThanOrEqual(10);
      expect(preset.convergenceThreshold).toBeGreaterThanOrEqual(0);
      expect(preset.convergenceThreshold).toBeLessThanOrEqual(1);
      expect(preset.proposerCount).toBeGreaterThanOrEqual(1);
    },
  );

  it('free preset uses :free model suffixes', () => {
    const free = MODE_PRESETS.free;
    expect(free.models.proposer).toContain(':free');
    expect(free.models.critic).toContain(':free');
    expect(free.models.judge).toContain(':free');
  });

  it('premium preset has highest rounds and threshold', () => {
    expect(MODE_PRESETS.premium.rounds).toBe(5);
    expect(MODE_PRESETS.premium.convergenceThreshold).toBe(0.9);
    expect(MODE_PRESETS.premium.proposerCount).toBe(3);
  });

  it('free preset has the lowest rounds and threshold', () => {
    expect(MODE_PRESETS.free.rounds).toBe(2);
    expect(MODE_PRESETS.free.convergenceThreshold).toBe(0.7);
  });

  it('each preset uses 3 different model families for diversity', () => {
    for (const mode of ['free', 'budget', 'balanced', 'premium'] as ModeName[]) {
      const { proposer, critic, judge } = MODE_PRESETS[mode].models;
      const providers = new Set([
        proposer.split('/')[0],
        critic.split('/')[0],
        judge.split('/')[0],
      ]);
      expect(providers.size).toBe(3);
    }
  });
});

describe('resolveMode', () => {
  it('returns preset values when no user overrides', () => {
    const result = resolveMode('balanced');
    expect(result.models.proposer).toBe('google/gemini-2.5-pro');
    expect(result.models.critic).toBe('openai/o3');
    expect(result.models.judge).toBe('anthropic/claude-sonnet-4.6');
    expect(result.rounds).toBe(3);
    expect(result.convergenceThreshold).toBe(0.8);
    expect(result.proposerCount).toBe(2);
  });

  it('user model override replaces only that role', () => {
    const result = resolveMode('free', {
      models: { proposer: 'custom/my-model' },
    });
    expect(result.models.proposer).toBe('custom/my-model');
    expect(result.models.critic).toBe('nousresearch/hermes-3-llama-3.1-405b:free');
    expect(result.models.judge).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });

  it('user rounds override replaces preset rounds', () => {
    const result = resolveMode('premium', { rounds: 2 });
    expect(result.rounds).toBe(2);
    expect(result.proposerCount).toBe(3); // proposerCount always from preset
  });

  it('user convergenceThreshold override replaces preset', () => {
    const result = resolveMode('budget', { convergenceThreshold: 0.5 });
    expect(result.convergenceThreshold).toBe(0.5);
  });

  it('returns all 3 model roles with empty user overrides', () => {
    const result = resolveMode('free', { models: {} });
    expect(result.models.proposer).toBe('qwen/qwen3-coder:free');
    expect(result.models.critic).toBe('nousresearch/hermes-3-llama-3.1-405b:free');
    expect(result.models.judge).toBe('meta-llama/llama-3.3-70b-instruct:free');
  });

  it('all 4 modes resolve without error', () => {
    for (const mode of ['free', 'budget', 'balanced', 'premium'] as ModeName[]) {
      const result = resolveMode(mode);
      expect(result.models).toBeDefined();
      expect(result.rounds).toBeDefined();
      expect(result.convergenceThreshold).toBeDefined();
      expect(result.proposerCount).toBeDefined();
    }
  });

  it('resolveMode with undefined overrides returns preset', () => {
    const result = resolveMode('budget', undefined);
    expect(result.models.proposer).toBe('qwen/qwen3-coder');
    expect(result.rounds).toBe(2);
  });
});
