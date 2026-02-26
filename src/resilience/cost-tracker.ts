import { BudgetExceededError } from '../shared/errors.js';
import type { TaskId } from '../shared/types.js';
import type { CostBudget } from './types.js';

/**
 * A single cost record from a provider call (spec Section 9.4.5).
 * Field names match TokenUsage (Section 9.4.1): promptTokens, completionTokens, totalTokens.
 */
export interface CostRecord {
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
  readonly timestamp: Date;
  readonly taskId?: TaskId;
  readonly phase?: 'plan' | 'debate' | 'build' | 'gate' | 'emit' | 'query';
}

/**
 * Budget enforcement tracker (spec Section 9.4.5).
 *
 * check() throws BudgetExceededError if any budget constraint is violated.
 * record() accumulates cost synchronously.
 */
export class CostTracker {
  private readonly _budget: CostBudget;
  private _records: CostRecord[] = [];

  constructor(budget: CostBudget) {
    this._budget = budget;
  }

  /** Total cost for the current run. */
  get currentRunCostUsd(): number {
    return this._records.reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** Total cost recorded today (UTC date). */
  get todayCostUsd(): number {
    const todayStr = new Date().toISOString().slice(0, 10);
    return this._records
      .filter((r) => r.timestamp.toISOString().slice(0, 10) === todayStr)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /** Total cost recorded this month (UTC month). */
  get monthCostUsd(): number {
    const monthStr = new Date().toISOString().slice(0, 7);
    return this._records
      .filter((r) => r.timestamp.toISOString().slice(0, 7) === monthStr)
      .reduce((sum, r) => sum + r.costUsd, 0);
  }

  /**
   * Record a cost entry. Called synchronously on the success path in ResilienceLayer.execute().
   */
  record(cost: CostRecord): void {
    this._records.push(cost);
  }

  /**
   * Check all budget constraints. Throws BudgetExceededError if any are violated.
   * BudgetExceededError is non-retryable and does NOT affect circuit breaker state.
   */
  check(): void {
    const runCost = this.currentRunCostUsd;
    const dayCost = this.todayCostUsd;
    const monthCost = this.monthCostUsd;

    if (this._budget.perRunUsd !== undefined && runCost > this._budget.perRunUsd) {
      throw new BudgetExceededError(runCost, this._budget.perRunUsd);
    }
    if (this._budget.perDayUsd !== undefined && dayCost > this._budget.perDayUsd) {
      throw new BudgetExceededError(dayCost, this._budget.perDayUsd);
    }
    if (this._budget.perMonthUsd !== undefined && monthCost > this._budget.perMonthUsd) {
      throw new BudgetExceededError(monthCost, this._budget.perMonthUsd);
    }
  }
}
