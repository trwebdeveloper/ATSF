/**
 * Shared test helpers for gate tests — T12
 */

import type { GateContext, ResolvedGateConfig, Logger } from '../../../src/gates/types.js';
import type { ArtifactSet, CrossRefValidationResult } from '../../../src/emitter/cross-ref-validator.js';
import type { ResilienceLayer } from '../../../src/resilience/resilience-layer.js';
import type { ProviderAdapter, GenerateResponse } from '../../../src/providers/types.js';
import { Semaphore } from '../../../src/resilience/semaphore.js';

/**
 * Minimal valid ArtifactSet for testing.
 */
export function createMinimalArtifactSet(_overrides?: Partial<ArtifactSet>): ArtifactSet {
  return {
    taskGraph: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'a'.repeat(64),
      project: {
        name: 'test-project',
        description: 'A test project for gate testing',
        constraints: [],
      },
      tasks: [
        {
          id: 'TASK-001',
          name: 'Implement feature A',
          description: 'Implement the core feature A with proper error handling',
          agent: 'builder',
          type: 'feature',
          dependsOn: [],
          filesWrite: ['src/feature-a.ts'],
          filesRead: [],
          priority: 3,
          acceptanceCriteria: [
            { description: 'Feature A returns correct results for all input types', testable: true },
          ],
          tags: [],
        },
        {
          id: 'TASK-002',
          name: 'Implement feature B',
          description: 'Implement feature B that depends on feature A',
          agent: 'builder',
          type: 'feature',
          dependsOn: ['TASK-001'],
          filesWrite: ['src/feature-b.ts'],
          filesRead: ['src/feature-a.ts'],
          priority: 2,
          acceptanceCriteria: [
            { description: 'Feature B integrates with feature A correctly', testable: true },
          ],
          tags: [],
        },
      ],
    },
    repoBlueprint: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'b'.repeat(64),
      projectName: 'test-project',
      root: [
        {
          name: 'src',
          type: 'dir',
          purpose: 'Source code',
          children: [
            { name: 'feature-a.ts', type: 'file', purpose: 'Feature A implementation' },
            { name: 'feature-b.ts', type: 'file', purpose: 'Feature B implementation' },
          ],
        },
      ],
    },
    mpd: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'c'.repeat(64),
      executiveSummary: {
        projectName: 'test-project',
        oneLiner: 'A test project for quality gate testing',
        objectives: ['Test quality gates'],
        targetAudience: ['Developers'],
        scope: { inScope: ['Quality gate testing'], outOfScope: ['Production deployment'] },
      },
      projectOverview: {
        background: 'Testing the quality gate system for ATSF',
        problemStatement: 'Need to validate output artifact quality',
        proposedSolution: 'Implement a plugin-based quality gate system',
        successCriteria: ['All 5 gates pass with score >= 0.8'],
        assumptions: [],
      },
      technicalArchitecture: {
        overview: 'Plugin-based architecture with parallel execution',
        diagrams: [{ type: 'flowchart', title: 'Gate Pipeline', source: 'graph TD; A-->B; B-->C;' }],
        patterns: [{ name: 'Plugin Pattern', rationale: 'Extensible gate system for quality validation' }],
        techStack: [{ name: 'TypeScript', purpose: 'Type-safe implementation', category: 'language' }],
      },
      componentDesign: {
        components: [{
          name: 'Gate System',
          description: 'Quality gate validation system',
          responsibilities: ['Validate artifacts', 'Generate reports'],
          interfaces: [],
          dependencies: [],
          taskRefs: ['TASK-001'],
        }],
      },
      dataModel: {
        overview: 'Simple data model for testing purposes',
        entities: [],
      },
      apiDesign: {
        overview: 'No API design for testing purposes',
        endpoints: [],
      },
      securityConsiderations: {
        overview: 'Basic security considerations for testing',
        threatModel: [],
      },
      testingStrategy: {
        overview: 'Comprehensive testing with unit and integration tests',
        levels: [{ name: 'unit', description: 'Unit tests for each gate implementation', tools: ['vitest'] }],
        taskRefs: ['TASK-001'],
      },
      deploymentPlan: {
        overview: 'Simple deployment plan for testing purposes',
        environments: [{ name: 'test', purpose: 'Testing environment' }],
      },
      riskAssessment: {
        risks: [{ id: 'RISK-001', description: 'Gate false positives may block valid configurations', probability: 'low', impact: 'minor', mitigation: 'Implement allowlisting' }],
      },
      timeline: {
        phases: [{ name: 'Phase 1', description: 'Implementation phase', taskRefs: ['TASK-001', 'TASK-002'] }],
        criticalPath: ['TASK-001', 'TASK-002'],
      },
      glossary: { terms: [] },
      appendices: { adrs: [], references: [] },
    },
    tickets: [
      {
        frontmatter: {
          id: 'TASK-001',
          title: 'Implement feature A',
          type: 'feature',
          priority: 'medium',
          estimate: '4h',
          dependencies: [],
          labels: [],
          assignee: 'unassigned',
          status: 'backlog',
        },
        body: {
          description: 'Implement the core feature A with proper error handling and validation',
          acceptanceCriteria: [
            { given: 'Valid input', when: 'Feature A is called', then: 'Returns correct result' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-002',
          title: 'Implement feature B',
          type: 'feature',
          priority: 'medium',
          estimate: '2h',
          dependencies: ['TASK-001'],
          labels: [],
          assignee: 'unassigned',
          status: 'backlog',
        },
        body: {
          description: 'Implement feature B that integrates with feature A for complete processing',
          acceptanceCriteria: [
            { given: 'Feature A is available', when: 'Feature B processes data', then: 'Integration works correctly' },
          ],
          relatedDecisions: [],
        },
      },
    ],
    promptPacks: [
      {
        taskId: 'TASK-001',
        taskName: 'Implement feature A',
        context: 'Implement the core feature A module for the test project',
        contract: {
          outputFiles: [{ filePath: 'src/feature-a.ts', exports: ['featureA'], description: 'Feature A implementation' }],
          exports: [],
          dependencies: [],
        },
        inputFiles: [],
        instructions: [{ step: 1, instruction: 'Create the feature A module with proper types and error handling' }],
        constraints: ['Must use TypeScript strict mode'],
        testCriteria: ['Feature A handles all input types correctly'],
        estimatedComplexity: 'medium',
        suggestedModel: 'balanced',
        previousTaskOutputs: [],
      },
      {
        taskId: 'TASK-002',
        taskName: 'Implement feature B',
        context: 'Implement feature B that depends on feature A output',
        contract: {
          outputFiles: [{ filePath: 'src/feature-b.ts', exports: ['featureB'], description: 'Feature B implementation' }],
          exports: [],
          dependencies: [],
        },
        inputFiles: [{ filePath: 'src/feature-a.ts', sourceTask: 'TASK-001' }],
        instructions: [{ step: 1, instruction: 'Create feature B module that integrates with feature A' }],
        constraints: ['Must use TypeScript strict mode'],
        testCriteria: ['Feature B integrates with feature A correctly'],
        estimatedComplexity: 'medium',
        suggestedModel: 'balanced',
        previousTaskOutputs: [],
      },
    ],
    adrs: [],
  } satisfies ArtifactSet;
}

/**
 * Create a default ResolvedGateConfig for testing.
 */
export function createDefaultConfig(overrides?: Partial<ResolvedGateConfig>): ResolvedGateConfig {
  return {
    threshold: 0.8,
    autoFix: true,
    maxFixRounds: 3,
    reporter: 'console',
    gates: {
      coverage: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
      consistency: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
      testability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
      buildability: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
      security: { enabled: true, threshold: 0.8, autoFix: true, rules: {} },
    },
    custom: [],
    ...overrides,
  };
}

/**
 * Create a mock Logger.
 */
export function createMockLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

/**
 * Create a mock ProviderAdapter.
 */
export function createMockProvider(): ProviderAdapter {
  return {
    id: 'mock-provider',
    name: 'Mock Provider',
    supportedModels: ['mock-model'],
    async generate(): Promise<GenerateResponse> {
      return {
        content: 'mock response',
        model: 'mock-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}

/**
 * Create a mock ResilienceLayer.
 */
export function createMockResilience(): ResilienceLayer {
  // Use a minimal mock that delegates execute to the function
  return {
    async execute<T>(_provider: string, fn: () => Promise<T>): Promise<T> {
      return fn();
    },
    registerProvider() {},
    getCircuitState() { return 'closed' as const; },
    getConcurrencyLimit() { return 5; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get costTracker() { return {} as any; },
    shutdown() {},
  } as unknown as ResilienceLayer;
}

/**
 * Create a mock cross-reference validator.
 */
export function createMockCrossRefValidator(): (artifacts: ArtifactSet) => CrossRefValidationResult {
  return () => ({
    valid: true,
    errors: [],
    warnings: [],
  });
}

/**
 * Create a full GateContext for testing.
 */
export function createGateContext(overrides?: Partial<GateContext>): GateContext {
  return {
    artifacts: createMinimalArtifactSet(),
    config: createDefaultConfig(),
    logger: createMockLogger(),
    validateCrossReferences: createMockCrossRefValidator(),
    signal: new AbortController().signal,
    resilience: createMockResilience(),
    provider: createMockProvider(),
    model: 'mock-model',
    llmSemaphore: new Semaphore(5),
    ...overrides,
  };
}
