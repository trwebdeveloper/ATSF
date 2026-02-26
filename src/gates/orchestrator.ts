/**
 * Gate Orchestrator — T12
 *
 * Runs all enabled gates in parallel (Section 7.1).
 * Phase 0: prerequisite validation
 * Phase 1: parallel gate execution with Promise.allSettled()
 * Phase 2: aggregate results, generate report
 * Phase 3: optional auto-fix
 */

import type {
  GateContext,
  GateResult,
  GateReport,
  ResolvedGateConfig,
  Logger,
  GateReporter,
} from './types.js';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import type { ProviderAdapter } from '../providers/types.js';
import type { Semaphore } from '../resilience/semaphore.js';
import type { ArtifactSet, CrossRefValidationResult } from '../emitter/cross-ref-validator.js';
import { GateRegistry } from './registry.js';
import { runFixEngine } from './fix-engine.js';

export interface GateOrchestratorOptions {
  readonly registry: GateRegistry;
  readonly config: ResolvedGateConfig;
  readonly logger: Logger;
  readonly resilience: ResilienceLayer;
  readonly provider: ProviderAdapter;
  readonly model: string;
  readonly llmSemaphore: Semaphore;
  readonly validateCrossReferences: (artifacts: ArtifactSet) => CrossRefValidationResult;
  readonly signal?: AbortSignal;
  readonly reporter?: GateReporter;
}

export class GateOrchestrator {
  private readonly _registry: GateRegistry;
  private readonly _config: ResolvedGateConfig;
  private readonly _logger: Logger;
  private readonly _resilience: ResilienceLayer;
  private readonly _provider: ProviderAdapter;
  private readonly _model: string;
  private readonly _llmSemaphore: Semaphore;
  private readonly _validateCrossReferences: (artifacts: ArtifactSet) => CrossRefValidationResult;
  private readonly _signal: AbortSignal;
  private readonly _reporter?: GateReporter;

  constructor(options: GateOrchestratorOptions) {
    this._registry = options.registry;
    this._config = options.config;
    this._logger = options.logger;
    this._resilience = options.resilience;
    this._provider = options.provider;
    this._model = options.model;
    this._llmSemaphore = options.llmSemaphore;
    this._validateCrossReferences = options.validateCrossReferences;
    this._signal = options.signal ?? new AbortController().signal;
    this._reporter = options.reporter;
  }

  /**
   * Run the full gate pipeline.
   */
  async run(artifacts: ArtifactSet): Promise<GateReport> {
    const pipelineStart = performance.now();

    // Build context
    const context: GateContext = {
      artifacts,
      config: this._config,
      logger: this._logger,
      validateCrossReferences: this._validateCrossReferences,
      signal: this._signal,
      resilience: this._resilience,
      provider: this._provider,
      model: this._model,
      llmSemaphore: this._llmSemaphore,
    };

    // Phase 1: Run all enabled gates in parallel
    const enabledGates = this._registry.getEnabled(this._config);
    this._logger.info(`Running ${enabledGates.length} quality gates in parallel`);

    const settled = await Promise.allSettled(
      enabledGates.map(gate => gate.run(context)),
    );

    const gateResults: GateResult[] = settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      this._logger.error(`Gate "${enabledGates[i].id}" failed: ${result.reason}`);
      return {
        gateId: enabledGates[i].id,
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: 0,
      };
    });

    // Phase 2: Aggregate results
    const overallScore = gateResults.length > 0
      ? gateResults.reduce((sum, r) => sum + r.score, 0) / gateResults.length
      : 1.0;

    const globalThreshold = this._config.threshold;
    let allPassed = overallScore >= globalThreshold;

    // Also check per-gate thresholds
    for (const result of gateResults) {
      if (!result.passed) {
        allPassed = false;
        break;
      }
    }

    // Phase 3: Optional auto-fix
    let fixesApplied = 0;
    let fixRoundsUsed = 0;
    let finalResults = gateResults;

    if (this._config.autoFix && !allPassed) {
      const fixResult = await runFixEngine(
        enabledGates,
        context,
        gateResults,
        {
          maxFixRounds: this._config.maxFixRounds,
          autoFix: this._config.autoFix,
        },
      );
      fixesApplied = fixResult.fixesApplied;
      fixRoundsUsed = fixResult.fixRoundsUsed;
      finalResults = [...fixResult.finalResults];
    }

    const finalScore = finalResults.length > 0
      ? finalResults.reduce((sum, r) => sum + r.score, 0) / finalResults.length
      : 1.0;
    const finalPassed = finalResults.every(r => r.passed) && finalScore >= globalThreshold;

    const report: GateReport = {
      timestamp: new Date(),
      duration: performance.now() - pipelineStart,
      gates: finalResults,
      overallScore: finalScore,
      passed: finalPassed,
      fixesApplied,
      fixRoundsUsed,
    };

    // Render report if reporter is configured
    if (this._reporter) {
      const output = this._reporter.render(report);
      this._logger.info(output);
    }

    return report;
  }
}
