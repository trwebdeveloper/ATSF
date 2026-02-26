/**
 * i18n tests — language string translations for emitters
 */
import { describe, it, expect } from 'vitest';
import { getStrings, langDirective, withLangDirective } from '../../../src/emitter/i18n.js';

describe('getStrings', () => {
  it('returns English strings for "en"', () => {
    const s = getStrings('en');
    expect(s.masterPlanningDocument).toBe('Master Planning Document');
    expect(s.executiveSummary).toBe('Executive Summary');
    expect(s.description).toBe('Description');
    expect(s.acceptanceCriteria).toBe('Acceptance Criteria');
    expect(s.instructions).toBe('Instructions');
    expect(s.doNot).toBe('DO NOT');
  });

  it('returns Turkish strings for "tr"', () => {
    const s = getStrings('tr');
    expect(s.masterPlanningDocument).toBe('Ana Planlama Dokumani');
    expect(s.executiveSummary).toBe('Yonetici Ozeti');
    expect(s.description).toBe('Aciklama');
    expect(s.acceptanceCriteria).toBe('Kabul Kriterleri');
    expect(s.instructions).toBe('Talimatlar');
    expect(s.doNot).toBe('YAPMAYIN');
  });

  it('falls back to English for unknown language', () => {
    const s = getStrings('fr');
    expect(s.masterPlanningDocument).toBe('Master Planning Document');
    expect(s.description).toBe('Description');
  });

  it('English and Turkish have the same keys', () => {
    const en = getStrings('en');
    const tr = getStrings('tr');
    const enKeys = Object.keys(en).sort();
    const trKeys = Object.keys(tr).sort();
    expect(enKeys).toEqual(trKeys);
  });

  it('no empty string values in English', () => {
    const s = getStrings('en');
    for (const [key, value] of Object.entries(s)) {
      expect(value, `en.${key} should not be empty`).not.toBe('');
    }
  });

  it('no empty string values in Turkish', () => {
    const s = getStrings('tr');
    for (const [key, value] of Object.entries(s)) {
      expect(value, `tr.${key} should not be empty`).not.toBe('');
    }
  });
});

describe('langDirective', () => {
  it('returns empty string for "en"', () => {
    expect(langDirective('en')).toBe('');
  });

  it('returns Turkish directive for "tr"', () => {
    const d = langDirective('tr');
    expect(d).toContain('Turkish');
    expect(d).toContain('IMPORTANT');
  });

  it('returns directive with raw code for unknown language', () => {
    const d = langDirective('fr');
    expect(d).toContain('fr');
  });
});

describe('withLangDirective', () => {
  it('returns original prompt for "en"', () => {
    const prompt = 'You are an architect.';
    expect(withLangDirective(prompt, 'en')).toBe(prompt);
  });

  it('prepends directive for "tr"', () => {
    const prompt = 'You are an architect.';
    const result = withLangDirective(prompt, 'tr');
    expect(result).toContain('Turkish');
    expect(result).toContain('You are an architect.');
    expect(result.indexOf('Turkish')).toBeLessThan(result.indexOf('You are'));
  });
});
