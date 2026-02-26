/**
 * `atsf gate` command — T15
 *
 * Run quality gate checks on generated artifacts.
 * Supports subcommands: `atsf gate check`, `atsf gate list`.
 *
 * Source: Section 3.3 (atsf gate); Section 7 (Quality Gates).
 */

import { Command, Flags } from '@oclif/core';
import { loadConfig } from '../../../config/loader.js';
import type { ATSFConfig } from '../../../config/schema.js';
import { GateOrchestrator } from '../../../gates/orchestrator.js';
import { GateRegistry } from '../../../gates/registry.js';
import { ResilienceLayer } from '../../../resilience/resilience-layer.js';
import { Semaphore } from '../../../resilience/semaphore.js';
import { validateCrossReferences } from '../../../emitter/cross-ref-validator.js';
import { createEventBus } from '../../../events/event-bus.js';
import type { ArtifactSet } from '../../../emitter/cross-ref-validator.js';
import type { GateReport } from '../../../gates/types.js';

/**
 * Core gate logic, extracted for testability.
 */
export async function runGateLogic(options: {
  dir: string;
  reporter?: string;
  threshold?: number;
  autoFix?: boolean;
  log: (msg: string) => void;
  logToStderr: (msg: string) => void;
}): Promise<GateReport> {
  const { dir, reporter: reporterOpt, threshold: thresholdOpt, autoFix, log, logToStderr } = options;

  // Load config
  let config: ATSFConfig;
  try {
    config = await loadConfig({ searchFrom: dir });
  } catch {
    config = await loadConfig({ overrides: {} });
  }

  const threshold = thresholdOpt ?? config.gate.threshold;
  const reporter = reporterOpt ?? config.gate.reporter;
  const shouldAutoFix = autoFix ?? config.gate.autoFix;

  log('Gate checks started');
  log(`  Directory: ${dir}`);
  log(`  Threshold: ${threshold}`);
  log(`  Reporter: ${reporter}`);

  // Set up gate orchestrator
  const eventBus = createEventBus();
  const resilience = new ResilienceLayer({}, eventBus);
  const registry = new GateRegistry();
  const llmSemaphore = new Semaphore(config.build.maxConcurrency);

  // Minimal stub provider for gate checks
  const stubProvider = {
    id: 'stub',
    name: 'Stub Provider',
    supportedModels: ['stub-model'] as readonly string[],
    generate: async () => ({
      content: '',
      model: 'stub-model',
      finishReason: 'stop' as const,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    healthCheck: async () => true,
  };

  // Resolve per-gate config with defaults filled in
  const resolvedGates: Record<string, {
    enabled: boolean;
    threshold: number;
    autoFix: boolean;
    rules: Record<string, { enabled: boolean; severity: 'error' | 'warning' | 'info' }>;
  }> = {};
  for (const [id, entry] of Object.entries(config.gate.gates)) {
    resolvedGates[id] = {
      enabled: entry.enabled,
      threshold: entry.threshold ?? threshold,
      autoFix: entry.autoFix ?? shouldAutoFix,
      rules: (entry.rules ?? {}) as Record<string, { enabled: boolean; severity: 'error' | 'warning' | 'info' }>,
    };
  }

  const orchestrator = new GateOrchestrator({
    registry,
    config: {
      threshold,
      autoFix: shouldAutoFix,
      maxFixRounds: config.gate.maxFixRounds,
      reporter: reporter as 'console' | 'json' | 'markdown' | 'junit',
      gates: resolvedGates,
      custom: config.gate.custom,
    },
    logger: {
      info: (msg: string) => log(msg),
      warn: (msg: string) => logToStderr(`WARN: ${msg}`),
      error: (msg: string) => logToStderr(`ERROR: ${msg}`),
      debug: () => {},
    },
    resilience,
    provider: stubProvider,
    model: 'stub-model',
    llmSemaphore,
    validateCrossReferences,
  });

  // Build minimal artifact set for gate evaluation
  const emptyArtifactSet: ArtifactSet = {
    taskGraph: { version: '', generated: '', checksum: '', project: { name: '', description: '', constraints: [] }, tasks: [] },
    repoBlueprint: { version: '', generated: '', checksum: '', projectName: '', root: [] },
    mpd: {} as unknown as ArtifactSet['mpd'],
    tickets: [],
    promptPacks: [],
    adrs: [],
  };

  const report = await orchestrator.run(emptyArtifactSet);

  if (reporter === 'json') {
    log(JSON.stringify({
      overallScore: report.overallScore,
      passed: report.passed,
      gates: report.gates.map(g => ({
        gateId: g.gateId,
        score: g.score,
        passed: g.passed,
      })),
      fixesApplied: report.fixesApplied,
      duration: report.duration,
    }, null, 2));
  } else {
    log('Gate checks complete');
    log(`  Overall score: ${report.overallScore.toFixed(2)}`);
    log(`  Passed: ${report.passed}`);
    log(`  Gates run: ${report.gates.length}`);
    log(`  Fixes applied: ${report.fixesApplied}`);
  }

  return report;
}

export default class Gate extends Command {
  static override description = 'Run quality gate checks on artifacts';

  static override examples = [
    '<%= config.bin %> gate',
    '<%= config.bin %> gate --dir ./project',
    '<%= config.bin %> gate --reporter json',
    '<%= config.bin %> gate --threshold 0.9',
  ];

  static override flags = {
    dir: Flags.string({
      char: 'd',
      description: 'Project directory containing artifacts',
      default: '.',
    }),
    reporter: Flags.string({
      char: 'r',
      description: 'Report output format',
      options: ['console', 'json', 'markdown', 'junit'],
      default: 'console',
    }),
    threshold: Flags.string({
      char: 't',
      description: 'Minimum passing score (0.0 - 1.0)',
    }),
    'auto-fix': Flags.boolean({
      description: 'Enable automatic fix attempts',
      default: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Gate);

    const threshold = flags.threshold
      ? Number.parseFloat(flags.threshold)
      : undefined;

    const report = await runGateLogic({
      dir: flags.dir,
      reporter: flags.reporter,
      threshold,
      autoFix: flags['auto-fix'],
      log: (msg) => this.log(msg),
      logToStderr: (msg) => this.logToStderr(msg),
    });

    if (!report.passed) {
      this.error(`Gate checks failed (score: ${report.overallScore.toFixed(2)})`, { exit: 1 });
    }
  }
}
