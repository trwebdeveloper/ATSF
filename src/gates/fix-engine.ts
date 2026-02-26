/**
 * Auto-Fix Engine — T12
 *
 * Declarative fix model inspired by ESLint (Section 7.4).
 * Applies fixes iteratively with conflict resolution.
 * Priority: security > buildability > consistency > coverage > testability.
 */

import type {
  GatePlugin,
  GateContext,
  GateResult,
  GateFix,
} from './types.js';

/**
 * Fix priority order (lower priority number = higher precedence).
 */
const FIX_PRIORITY_ORDER: Record<string, number> = {
  security: 0,
  buildability: 1,
  consistency: 2,
  coverage: 3,
  testability: 4,
};

/**
 * Generate a location key for conflict detection.
 * Same file + same path = conflicting.
 */
function locationKey(fix: GateFix): string {
  return `${fix.location.file}:${fix.location.path.join('/')}`;
}

/**
 * Resolve conflicts between fixes from different gates.
 * Higher-priority (lower priority number) fixes win.
 */
export function resolveConflicts(fixes: readonly GateFix[]): GateFix[] {
  const byLocation = new Map<string, GateFix>();

  // Sort by gate priority (ascending) so lower priority number comes first
  const sorted = [...fixes].sort((a, b) => {
    const aPriority = FIX_PRIORITY_ORDER[a.gateId] ?? 999;
    const bPriority = FIX_PRIORITY_ORDER[b.gateId] ?? 999;
    return aPriority - bPriority;
  });

  for (const fix of sorted) {
    const key = locationKey(fix);
    if (!byLocation.has(key)) {
      byLocation.set(key, fix);
    }
    // If already exists, the higher-priority fix (already inserted) wins
  }

  return [...byLocation.values()];
}

/**
 * Apply fixes to the artifact set.
 * Returns the number of fixes applied.
 * In a real implementation this would mutate the artifacts;
 * for now it simulates the application and counts fixes.
 */
export function applyFixes(fixes: readonly GateFix[]): number {
  // Each fix represents a declarative transformation.
  // In the full pipeline these would mutate artifact data.
  return fixes.length;
}

export interface FixEngineConfig {
  /** Maximum fix rounds (default: 3, max: 10). */
  maxFixRounds: number;
  /** Whether auto-fix is enabled. */
  autoFix: boolean;
}

export interface FixEngineResult {
  /** Total number of fixes applied across all rounds. */
  fixesApplied: number;
  /** Number of fix rounds used. */
  fixRoundsUsed: number;
  /** Final gate results after fixes. */
  finalResults: readonly GateResult[];
}

/**
 * Run the auto-fix engine.
 *
 * Re-runs gates after each round of fixes, up to maxFixRounds.
 * Stops early if all gates pass or no more fixes are available.
 */
export async function runFixEngine(
  gates: readonly GatePlugin[],
  context: GateContext,
  initialResults: readonly GateResult[],
  config: FixEngineConfig,
): Promise<FixEngineResult> {
  if (!config.autoFix || config.maxFixRounds === 0) {
    return {
      fixesApplied: 0,
      fixRoundsUsed: 0,
      finalResults: initialResults,
    };
  }

  let currentResults = initialResults;
  let totalFixesApplied = 0;
  let roundsUsed = 0;

  for (let round = 0; round < config.maxFixRounds; round++) {
    // Check if all gates pass
    const allPassed = currentResults.every(r => r.passed);
    if (allPassed) break;

    // Collect all fixes from failing gates
    const allFixes: GateFix[] = [];
    for (const result of currentResults) {
      if (!result.passed) {
        allFixes.push(...result.fixes);
      }
    }

    if (allFixes.length === 0) break;

    // Resolve conflicts
    const resolvedFixes = resolveConflicts(allFixes);

    // Apply fixes
    const applied = applyFixes(resolvedFixes);
    totalFixesApplied += applied;
    roundsUsed++;

    if (applied === 0) break;

    // Re-run all gates with updated context
    const newResults = await Promise.allSettled(
      gates.map(gate => gate.run(context)),
    );

    currentResults = newResults.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        gateId: gates[i].id,
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: 0,
      };
    });
  }

  return {
    fixesApplied: totalFixesApplied,
    fixRoundsUsed: roundsUsed,
    finalResults: currentResults,
  };
}
