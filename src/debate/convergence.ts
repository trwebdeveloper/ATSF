/**
 * Convergence detection for the debate engine (spec Section 6.6).
 *
 * Uses a weighted composite score:
 *   convergenceScore = 0.6 * optionAgreement + 0.4 * critiqueOverlap
 *
 * fuzzyMatch uses BM25 text similarity via wink-bm25-text-search (threshold 0.6).
 */

import BM25 from 'wink-bm25-text-search';
import type { Proposal, Critique, ConvergenceResult, RoundMetric } from './types.js';

// ─── Configuration for detectConvergence ────────────────────────────

export interface ConvergenceConfig {
  readonly convergenceThreshold: number;
  readonly round: number;
  readonly tokenUsage?: number;
}

// ─── fuzzyMatch ─────────────────────────────────────────────────────

/**
 * Determines whether a critique concern is semantically equivalent
 * to any previously raised concern using BM25 text similarity.
 *
 * A BM25 similarity score > 0.6 means the concern is substantially
 * the same as a previously raised concern.
 */
/**
 * Simple tokenizer for BM25: lowercases text, splits on non-word characters,
 * and filters out empty tokens.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(t => t.length > 0);
}

export function fuzzyMatch(concern: string, previousConcerns: string[]): boolean {
  if (previousConcerns.length === 0) return false;

  const engine = BM25();
  engine.defineConfig({ fldWeights: { text: 1 } });
  // Register the tokenizer as the prep task pipeline
  engine.definePrepTasks([tokenize]);

  // BM25 requires at least 3 documents for consolidation.
  // Pad with sentinel docs that won't match any real concern.
  const SENTINEL = 'xyzsentinelxyz';
  const docsNeeded = Math.max(3, previousConcerns.length);

  for (let i = 0; i < previousConcerns.length; i++) {
    engine.addDoc({ text: previousConcerns[i] }, i);
  }
  for (let i = previousConcerns.length; i < docsNeeded; i++) {
    engine.addDoc({ text: `${SENTINEL}${i}pad` }, i);
  }
  engine.consolidate();

  const results: Array<[number, number]> = engine.search(concern);
  // Filter out sentinel docs and check threshold
  const realResults = results.filter(([id]) => id < previousConcerns.length);
  return realResults.length > 0 && realResults[0][1] > 0.6;
}

// ─── ConvergenceDetector ────────────────────────────────────────────

export class ConvergenceDetector {
  /**
   * Detect convergence given current proposals, critiques, and previous critiques.
   *
   * Algorithm (spec Section 6.6.1):
   *   1. Option Agreement: plurality ratio (maxCount / proposals.length)
   *   2. Critique Overlap: 1 - (newConcerns / currentConcerns) for round > 1; 0 for round 1
   *   3. Composite: 0.6 * optionAgreement + 0.4 * critiqueOverlap
   */
  detectConvergence(
    proposals: readonly Proposal[],
    critiques: readonly Critique[],
    previousCritiques: readonly Critique[],
    config: ConvergenceConfig,
  ): ConvergenceResult {
    // Step 1: Option Agreement (plurality ratio)
    const optionAgreement = this._computeOptionAgreement(proposals);

    // Step 2: Critique Overlap
    const { critiqueOverlap, overlappingCriteria, divergentCriteria } =
      this._computeCritiqueOverlap(critiques, previousCritiques, config.round);

    // Step 3: Composite score
    const score = 0.6 * optionAgreement + 0.4 * critiqueOverlap;

    const roundMetric: RoundMetric = {
      round: config.round,
      optionAgreement,
      critiqueOverlap,
      tokenUsage: config.tokenUsage ?? 0,
    };

    return {
      converged: score >= config.convergenceThreshold,
      score,
      overlappingCriteria,
      divergentCriteria,
      roundMetrics: [roundMetric],
    };
  }

  private _computeOptionAgreement(proposals: readonly Proposal[]): number {
    if (proposals.length === 0) return 0;

    const optionCounts = new Map<string, number>();
    for (const p of proposals) {
      const normalized = p.option.toLowerCase().trim();
      optionCounts.set(normalized, (optionCounts.get(normalized) ?? 0) + 1);
    }

    const uniqueCount = optionCounts.size;
    if (uniqueCount === 1) return 1.0;

    let maxCount = 0;
    for (const count of optionCounts.values()) {
      if (count > maxCount) maxCount = count;
    }

    return maxCount / proposals.length;
  }

  private _computeCritiqueOverlap(
    critiques: readonly Critique[],
    previousCritiques: readonly Critique[],
    round: number,
  ): {
    critiqueOverlap: number;
    overlappingCriteria: string[];
    divergentCriteria: string[];
  } {
    // Round 1: all concerns are new
    if (round === 1 || previousCritiques.length === 0) {
      const allConcerns = critiques.flatMap(c => [...c.weaknesses]);
      return {
        critiqueOverlap: 0.0,
        overlappingCriteria: [],
        divergentCriteria: allConcerns,
      };
    }

    const previousConcerns = previousCritiques.flatMap(c => [...c.weaknesses]);
    const currentConcerns = critiques.flatMap(c => [...c.weaknesses]);

    if (currentConcerns.length === 0) {
      return {
        critiqueOverlap: 1.0,
        overlappingCriteria: [],
        divergentCriteria: [],
      };
    }

    const overlapping: string[] = [];
    const divergent: string[] = [];

    for (const concern of currentConcerns) {
      if (fuzzyMatch(concern, previousConcerns)) {
        overlapping.push(concern);
      } else {
        divergent.push(concern);
      }
    }

    const critiqueOverlap = 1.0 - (divergent.length / Math.max(currentConcerns.length, 1));

    return {
      critiqueOverlap,
      overlappingCriteria: overlapping,
      divergentCriteria: divergent,
    };
  }
}
