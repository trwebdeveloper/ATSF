import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../../src/resilience/cost-tracker.js';
import { BudgetExceededError } from '../../../src/shared/errors.js';
import type { CostRecord } from '../../../src/resilience/cost-tracker.js';

function makeCostRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.01,
    timestamp: new Date(),
    ...overrides,
  };
}

describe('CostTracker', () => {
  it('starts with zero costs', () => {
    const tracker = new CostTracker({ perRunUsd: 10 });
    expect(tracker.currentRunCostUsd).toBe(0);
    expect(tracker.todayCostUsd).toBe(0);
    expect(tracker.monthCostUsd).toBe(0);
  });

  it('record() accumulates costs', () => {
    const tracker = new CostTracker({ perRunUsd: 10 });
    tracker.record(makeCostRecord({ costUsd: 0.05 }));
    tracker.record(makeCostRecord({ costUsd: 0.03 }));
    expect(tracker.currentRunCostUsd).toBeCloseTo(0.08);
    expect(tracker.todayCostUsd).toBeCloseTo(0.08);
    expect(tracker.monthCostUsd).toBeCloseTo(0.08);
  });

  it('check() does not throw when under budget', () => {
    const tracker = new CostTracker({ perRunUsd: 1 });
    tracker.record(makeCostRecord({ costUsd: 0.5 }));
    expect(() => tracker.check()).not.toThrow();
  });

  it('check() throws BudgetExceededError when perRunUsd exceeded', () => {
    const tracker = new CostTracker({ perRunUsd: 0.05 });
    tracker.record(makeCostRecord({ costUsd: 0.06 }));
    expect(() => tracker.check()).toThrow(BudgetExceededError);
  });

  it('check() throws BudgetExceededError when perDayUsd exceeded', () => {
    const tracker = new CostTracker({ perDayUsd: 0.05 });
    tracker.record(makeCostRecord({ costUsd: 0.06 }));
    expect(() => tracker.check()).toThrow(BudgetExceededError);
  });

  it('check() throws BudgetExceededError when perMonthUsd exceeded', () => {
    const tracker = new CostTracker({ perMonthUsd: 0.05 });
    tracker.record(makeCostRecord({ costUsd: 0.06 }));
    expect(() => tracker.check()).toThrow(BudgetExceededError);
  });

  it('check() passes when no budget configured', () => {
    const tracker = new CostTracker({});
    tracker.record(makeCostRecord({ costUsd: 999 }));
    expect(() => tracker.check()).not.toThrow();
  });

  it('CostRecord uses TokenUsage field names (promptTokens, completionTokens, totalTokens)', () => {
    const record: CostRecord = makeCostRecord({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
    });
    // Verify the field names match TokenUsage interface
    expect(record.promptTokens).toBe(200);
    expect(record.completionTokens).toBe(100);
    expect(record.totalTokens).toBe(300);
  });

  it('CostRecord supports optional taskId and phase', () => {
    const record: CostRecord = makeCostRecord({
      taskId: 'task-1',
      phase: 'debate',
    });
    expect(record.taskId).toBe('task-1');
    expect(record.phase).toBe('debate');
  });

  it('BudgetExceededError carries currentCostUsd and budgetLimitUsd', () => {
    const tracker = new CostTracker({ perRunUsd: 0.05 });
    tracker.record(makeCostRecord({ costUsd: 0.10 }));
    try {
      tracker.check();
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExceededError);
      const err = e as BudgetExceededError;
      expect(err.currentCostUsd).toBeCloseTo(0.10);
      expect(err.budgetLimitUsd).toBe(0.05);
    }
  });

  it('multiple budget constraints - fails if any exceeded', () => {
    // perRunUsd OK but perDayUsd exceeded
    const tracker = new CostTracker({ perRunUsd: 1.0, perDayUsd: 0.05 });
    tracker.record(makeCostRecord({ costUsd: 0.06 }));
    expect(() => tracker.check()).toThrow(BudgetExceededError);
  });
});
