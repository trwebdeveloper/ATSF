import { describe, it, expect, vi } from 'vitest';
import { GateOrchestrator } from '../../../src/gates/orchestrator.js';
import { GateRegistry } from '../../../src/gates/registry.js';
import { Semaphore } from '../../../src/resilience/semaphore.js';
import type { GatePlugin, GateResult, GateContext } from '../../../src/gates/types.js';
import {
  createDefaultConfig,
  createMinimalArtifactSet,
  createMockLogger,
  createMockProvider,
  createMockResilience,
  createMockCrossRefValidator,
} from './helpers.js';
import { consoleReporter } from '../../../src/gates/reporters/console.js';
import { jsonReporter } from '../../../src/gates/reporters/json.js';
import { markdownReporter } from '../../../src/gates/reporters/markdown.js';
import { junitReporter } from '../../../src/gates/reporters/junit.js';

function createPassingGate(id: string, priority: number): GatePlugin {
  return {
    id,
    name: `${id} gate`,
    version: '1.0.0',
    priority,
    fixable: false,
    async run(): Promise<GateResult> {
      return {
        gateId: id,
        score: 1.0,
        passed: true,
        findings: [],
        fixes: [],
        durationMs: 1,
      };
    },
  };
}

describe('GateOrchestrator', () => {
  it('runs all gates in parallel', async () => {
    const executionOrder: string[] = [];

    const gate1: GatePlugin = {
      ...createPassingGate('gate-a', 0),
      async run(): Promise<GateResult> {
        executionOrder.push('gate-a');
        return { gateId: 'gate-a', score: 1.0, passed: true, findings: [], fixes: [], durationMs: 0 };
      },
    };

    const gate2: GatePlugin = {
      ...createPassingGate('gate-b', 1),
      async run(): Promise<GateResult> {
        executionOrder.push('gate-b');
        return { gateId: 'gate-b', score: 1.0, passed: true, findings: [], fixes: [], durationMs: 0 };
      },
    };

    const registry = new GateRegistry([]);
    registry.register(gate1);
    registry.register(gate2);

    const orchestrator = new GateOrchestrator({
      registry,
      config: createDefaultConfig(),
      logger: createMockLogger(),
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
    });

    const report = await orchestrator.run(createMinimalArtifactSet());

    // Both gates ran
    expect(executionOrder).toContain('gate-a');
    expect(executionOrder).toContain('gate-b');
    expect(report.gates.length).toBe(2);
  });

  it('aggregates results into GateReport', async () => {
    const registry = new GateRegistry([]);
    registry.register(createPassingGate('alpha', 0));
    registry.register(createPassingGate('beta', 1));

    const orchestrator = new GateOrchestrator({
      registry,
      config: createDefaultConfig(),
      logger: createMockLogger(),
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
    });

    const report = await orchestrator.run(createMinimalArtifactSet());

    expect(report.timestamp).toBeInstanceOf(Date);
    expect(typeof report.duration).toBe('number');
    expect(report.gates.length).toBe(2);
    expect(report.overallScore).toBe(1.0);
    expect(report.passed).toBe(true);
    expect(report.fixesApplied).toBe(0);
    expect(report.fixRoundsUsed).toBe(0);
  });

  it('handles gate failures gracefully', async () => {
    const registry = new GateRegistry([]);
    registry.register(createPassingGate('good', 0));
    registry.register({
      id: 'bad',
      name: 'Bad Gate',
      version: '1.0.0',
      priority: 1,
      fixable: false,
      async run(): Promise<GateResult> {
        throw new Error('Gate exploded');
      },
    });

    const orchestrator = new GateOrchestrator({
      registry,
      config: createDefaultConfig(),
      logger: createMockLogger(),
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
    });

    const report = await orchestrator.run(createMinimalArtifactSet());

    // Should not throw, should handle gracefully
    expect(report.gates.length).toBe(2);
    const badResult = report.gates.find(g => g.gateId === 'bad');
    expect(badResult?.score).toBe(0);
    expect(badResult?.passed).toBe(false);
  });

  it('GateContext includes all required fields', async () => {
    let capturedContext: GateContext | undefined;

    const inspectorGate: GatePlugin = {
      id: 'inspector',
      name: 'Inspector',
      version: '1.0.0',
      priority: 0,
      fixable: false,
      async run(context: GateContext): Promise<GateResult> {
        capturedContext = context;
        return { gateId: 'inspector', score: 1.0, passed: true, findings: [], fixes: [], durationMs: 0 };
      },
    };

    const registry = new GateRegistry([]);
    registry.register(inspectorGate);

    const orchestrator = new GateOrchestrator({
      registry,
      config: createDefaultConfig(),
      logger: createMockLogger(),
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
    });

    await orchestrator.run(createMinimalArtifactSet());

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.artifacts).toBeDefined();
    expect(capturedContext!.config).toBeDefined();
    expect(capturedContext!.logger).toBeDefined();
    expect(capturedContext!.validateCrossReferences).toBeDefined();
    expect(capturedContext!.signal).toBeDefined();
    expect(capturedContext!.resilience).toBeDefined();
    expect(capturedContext!.provider).toBeDefined();
    expect(capturedContext!.model).toBe('test-model');
    expect(capturedContext!.llmSemaphore).toBeInstanceOf(Semaphore);
  });

  it('respects gate enabled/disabled config', async () => {
    const registry = new GateRegistry([]);
    registry.register(createPassingGate('enabled-gate', 0));
    registry.register(createPassingGate('disabled-gate', 1));

    const config = createDefaultConfig({
      gates: {
        'enabled-gate': { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
        'disabled-gate': { enabled: false, threshold: 0.8, autoFix: true, rules: {} },
      },
    });

    const orchestrator = new GateOrchestrator({
      registry,
      config,
      logger: createMockLogger(),
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
    });

    const report = await orchestrator.run(createMinimalArtifactSet());
    expect(report.gates.length).toBe(1);
    expect(report.gates[0].gateId).toBe('enabled-gate');
  });

  it('uses reporter when configured', async () => {
    const registry = new GateRegistry([]);
    registry.register(createPassingGate('test-gate', 0));

    const logger = createMockLogger();
    const infoSpy = vi.fn();
    logger.info = infoSpy;

    const orchestrator = new GateOrchestrator({
      registry,
      config: createDefaultConfig(),
      logger,
      resilience: createMockResilience(),
      provider: createMockProvider(),
      model: 'test-model',
      llmSemaphore: new Semaphore(5),
      validateCrossReferences: createMockCrossRefValidator(),
      reporter: consoleReporter,
    });

    await orchestrator.run(createMinimalArtifactSet());

    // Logger should have been called with the report output
    expect(infoSpy).toHaveBeenCalled();
  });
});

describe('Reporters', () => {
  const sampleReport = {
    timestamp: new Date('2024-01-01T00:00:00Z'),
    duration: 1234,
    gates: [
      {
        gateId: 'coverage',
        score: 0.9,
        passed: true,
        findings: [],
        fixes: [],
        durationMs: 100,
      },
      {
        gateId: 'security',
        score: 0.6,
        passed: false,
        findings: [{
          ruleId: 'secret-aws-key',
          severity: 'error' as const,
          message: 'AWS key detected',
          location: { artifact: 'task_graph' as const, file: 'task.yaml', path: ['tasks'] },
          fixable: true,
        }],
        fixes: [],
        durationMs: 200,
      },
    ],
    overallScore: 0.75,
    passed: false,
    fixesApplied: 0,
    fixRoundsUsed: 0,
  };

  describe('Console Reporter', () => {
    it('has format "console"', () => {
      expect(consoleReporter.format).toBe('console');
    });

    it('renders report with gate results', () => {
      const output = consoleReporter.render(sampleReport);
      expect(output).toContain('Quality Gate Report');
      expect(output).toContain('coverage');
      expect(output).toContain('security');
      expect(output).toContain('PASS');
      expect(output).toContain('FAIL');
    });

    it('includes findings in output', () => {
      const output = consoleReporter.render(sampleReport);
      expect(output).toContain('AWS key detected');
    });
  });

  describe('JSON Reporter', () => {
    it('has format "json"', () => {
      expect(jsonReporter.format).toBe('json');
    });

    it('renders valid JSON', () => {
      const output = jsonReporter.render(sampleReport);
      const parsed = JSON.parse(output);
      expect(parsed.overallScore).toBe(0.75);
      expect(parsed.passed).toBe(false);
      expect(parsed.gates).toHaveLength(2);
    });

    it('includes findings in JSON output', () => {
      const output = jsonReporter.render(sampleReport);
      const parsed = JSON.parse(output);
      expect(parsed.gates[1].findings[0].ruleId).toBe('secret-aws-key');
    });
  });

  describe('Markdown Reporter', () => {
    it('has format "markdown"', () => {
      expect(markdownReporter.format).toBe('markdown');
    });

    it('renders markdown with headers', () => {
      const output = markdownReporter.render(sampleReport);
      expect(output).toContain('# Quality Gate Report');
      expect(output).toContain('## Gate Results');
    });

    it('renders markdown table', () => {
      const output = markdownReporter.render(sampleReport);
      expect(output).toContain('| Gate | Score | Status | Findings | Duration |');
      expect(output).toContain('| coverage |');
      expect(output).toContain('| security |');
    });

    it('includes detailed findings', () => {
      const output = markdownReporter.render(sampleReport);
      expect(output).toContain('secret-aws-key');
      expect(output).toContain('AWS key detected');
    });
  });

  describe('JUnit Reporter', () => {
    it('has format "junit"', () => {
      expect(junitReporter.format).toBe('junit');
    });

    it('renders valid XML structure', () => {
      const output = junitReporter.render(sampleReport);
      expect(output).toContain('<?xml version="1.0"');
      expect(output).toContain('<testsuites');
      expect(output).toContain('</testsuites>');
    });

    it('includes test counts', () => {
      const output = junitReporter.render(sampleReport);
      expect(output).toContain('tests="2"');
      expect(output).toContain('failures="1"');
    });

    it('includes failure details for failing gates', () => {
      const output = junitReporter.render(sampleReport);
      expect(output).toContain('<failure');
      expect(output).toContain('security');
    });
  });
});
