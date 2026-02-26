/**
 * Integration tests for GateOrchestrator — all 5 built-in gates on sample artifacts.
 *
 * Tests verify:
 * 1. All 5 built-in gates run on a valid artifact set
 * 2. GateReport structure is correct
 * 3. Scores and pass/fail logic are correct
 * 4. Each individual gate is exercised with targeted data
 * 5. Disabled gates are excluded
 * 6. Report is produced with correct shape
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GateOrchestrator } from '../../src/gates/orchestrator.js';
import { GateRegistry, BUILTIN_GATES } from '../../src/gates/registry.js';
import { ResilienceLayer } from '../../src/resilience/resilience-layer.js';
import { Semaphore } from '../../src/resilience/semaphore.js';
import { validateCrossReferences } from '../../src/emitter/cross-ref-validator.js';
import type { ArtifactSet } from '../../src/emitter/cross-ref-validator.js';
import type { ResolvedGateConfig, Logger } from '../../src/gates/types.js';
import type { ProviderAdapter, GenerateResponse } from '../../src/providers/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function createMockProvider(): ProviderAdapter {
  return {
    id: 'mock',
    name: 'Mock',
    supportedModels: ['mock-model'],
    async generate(): Promise<GenerateResponse> {
      return {
        content: 'mock',
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

function createDefaultConfig(overrides?: Partial<ResolvedGateConfig>): ResolvedGateConfig {
  return {
    threshold: 0.0,   // Low threshold so gates pass even with minor issues
    autoFix: false,
    maxFixRounds: 0,
    reporter: 'console',
    gates: {
      coverage: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
      consistency: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
      testability: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
      buildability: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
      security: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
    },
    custom: [],
    ...overrides,
  };
}

/**
 * Builds a comprehensive valid artifact set for gate testing.
 * All 5 tasks are included with proper cross-references between artifacts.
 */
function buildValidArtifactSet(): ArtifactSet {
  const tasks = [
    {
      id: 'TASK-001',
      name: 'Set up project foundation',
      description: 'Initialize the project with all required tooling and configuration files',
      agent: 'planner' as const,
      type: 'infrastructure' as const,
      dependsOn: [] as string[],
      filesWrite: ['package.json', 'tsconfig.json'],
      filesRead: [] as string[],
      priority: 5,
      acceptanceCriteria: [
        { description: 'Project initializes without errors when running install', testable: true },
        { description: 'TypeScript compilation succeeds with zero errors', testable: true },
      ],
      tags: ['setup'],
    },
    {
      id: 'TASK-002',
      name: 'Implement core data models',
      description: 'Create all TypeScript interfaces and Zod schemas for the data layer',
      agent: 'architect' as const,
      type: 'architecture' as const,
      dependsOn: ['TASK-001'],
      filesWrite: ['src/models/user.ts', 'src/models/index.ts'],
      filesRead: ['tsconfig.json'],
      priority: 4,
      acceptanceCriteria: [
        { description: 'User model validates all required fields against schema', testable: true },
        { description: 'Index exports all models correctly', testable: true },
      ],
      tags: ['models', 'data'],
    },
    {
      id: 'TASK-003',
      name: 'Implement user service',
      description: 'Build the user service with CRUD operations and business logic',
      agent: 'builder' as const,
      type: 'feature' as const,
      dependsOn: ['TASK-002'],
      filesWrite: ['src/services/user-service.ts'],
      filesRead: ['src/models/user.ts', 'src/models/index.ts'],
      priority: 3,
      acceptanceCriteria: [
        { description: 'All CRUD operations complete successfully for valid user data', testable: true },
        { description: 'Invalid data is rejected with appropriate error messages', testable: true },
      ],
      tags: ['service', 'users'],
    },
    {
      id: 'TASK-004',
      name: 'Write unit tests',
      description: 'Implement comprehensive unit tests for all service and model code',
      agent: 'reviewer' as const,
      type: 'testing' as const,
      dependsOn: ['TASK-003'],
      filesWrite: ['tests/user-service.test.ts', 'tests/models.test.ts'],
      filesRead: ['src/services/user-service.ts', 'src/models/user.ts'],
      priority: 3,
      acceptanceCriteria: [
        { description: 'All test suites pass with at least 80% code coverage', testable: true },
        { description: 'Edge cases and error conditions are covered by tests', testable: true },
      ],
      tags: ['testing'],
    },
    {
      id: 'TASK-005',
      name: 'Write API documentation',
      description: 'Create comprehensive API documentation including usage examples and integration guides',
      agent: 'documenter' as const,
      type: 'documentation' as const,
      dependsOn: ['TASK-003'],
      filesWrite: ['docs/api.md'],
      filesRead: ['src/services/user-service.ts'],
      priority: 2,
      acceptanceCriteria: [
        { description: 'All public API endpoints are documented with examples', testable: false },
        { description: 'Documentation includes authentication and error handling sections', testable: true },
      ],
      tags: ['docs'],
    },
  ];

  return {
    taskGraph: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'a'.repeat(64),
      project: {
        name: 'user-service',
        description: 'A comprehensive user service with CRUD operations and documentation',
        constraints: ['Must use TypeScript strict mode', 'Zero external runtime dependencies'],
      },
      tasks,
    },
    repoBlueprint: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'b'.repeat(64),
      projectName: 'user-service',
      root: [
        {
          name: 'src',
          type: 'dir',
          purpose: 'Source code',
          children: [
            {
              name: 'models',
              type: 'dir',
              purpose: 'Data models',
              children: [
                { name: 'user.ts', type: 'file', purpose: 'User data model', generatedBy: 'TASK-002' },
                { name: 'index.ts', type: 'file', purpose: 'Model exports', generatedBy: 'TASK-002' },
              ],
            },
            {
              name: 'services',
              type: 'dir',
              purpose: 'Business logic services',
              children: [
                { name: 'user-service.ts', type: 'file', purpose: 'User service implementation', generatedBy: 'TASK-003' },
              ],
            },
          ],
        },
        {
          name: 'tests',
          type: 'dir',
          purpose: 'Test files',
          children: [
            { name: 'user-service.test.ts', type: 'file', purpose: 'User service unit tests', generatedBy: 'TASK-004' },
            { name: 'models.test.ts', type: 'file', purpose: 'Model unit tests', generatedBy: 'TASK-004' },
          ],
        },
        {
          name: 'docs',
          type: 'dir',
          purpose: 'Documentation',
          children: [
            { name: 'api.md', type: 'file', purpose: 'API documentation', generatedBy: 'TASK-005' },
          ],
        },
        { name: 'package.json', type: 'file', purpose: 'Package configuration', generatedBy: 'TASK-001' },
        { name: 'tsconfig.json', type: 'file', purpose: 'TypeScript configuration', generatedBy: 'TASK-001' },
      ],
    },
    mpd: {
      version: '1.0',
      generated: new Date().toISOString(),
      checksum: 'sha256:' + 'c'.repeat(64),
      executiveSummary: {
        projectName: 'user-service',
        oneLiner: 'A robust user service with CRUD operations and comprehensive documentation',
        objectives: [
          'Provide reliable user management capabilities',
          'Achieve 80% test coverage',
        ],
        targetAudience: ['Backend developers', 'API consumers'],
        scope: {
          inScope: ['CRUD operations for users', 'API documentation', 'Unit tests'],
          outOfScope: ['Authentication system', 'Frontend UI', 'Database management'],
        },
      },
      projectOverview: {
        background: 'The user service provides core user management functionality for the application',
        problemStatement: 'Need a reliable user management service with proper validation and documentation',
        proposedSolution: 'Build a TypeScript user service with Zod validation and comprehensive test coverage',
        successCriteria: [
          'All CRUD operations work correctly',
          'Test coverage exceeds 80%',
          'API documentation is complete',
        ],
        assumptions: [
          { id: 'ASMP-001', description: 'Users will have unique email addresses', source: 'inferred' as const },
        ],
      },
      technicalArchitecture: {
        overview: 'A simple layered architecture with models, services, and documentation',
        diagrams: [
          { type: 'flowchart' as const, title: 'User Service Architecture', source: 'graph TD; Models-->Services; Services-->API;' },
        ],
        patterns: [
          { name: 'Repository Pattern', rationale: 'Separates data access from business logic for testability' },
        ],
        techStack: [
          { name: 'TypeScript', purpose: 'Type-safe implementation', category: 'language' as const },
          { name: 'Zod', purpose: 'Runtime schema validation', category: 'library' as const },
        ],
      },
      componentDesign: {
        components: [
          {
            name: 'User Models',
            description: 'Data model definitions for user entities with Zod schemas',
            responsibilities: ['Define user data structure', 'Validate user data at runtime'],
            interfaces: ['UserSchema', 'User'],
            dependencies: [],
            taskRefs: ['TASK-002'],
          },
          {
            name: 'User Service',
            description: 'Business logic for user management with CRUD operations',
            responsibilities: ['Create users', 'Read users', 'Update users', 'Delete users'],
            interfaces: ['UserService'],
            dependencies: ['User Models'],
            taskRefs: ['TASK-003'],
          },
        ],
      },
      dataModel: {
        overview: 'Simple data model with User entity',
        entities: [
          {
            name: 'User',
            description: 'Represents a user in the system',
            fields: [
              { name: 'id', type: 'string', constraints: 'uuid', description: 'Unique user identifier' },
              { name: 'email', type: 'string', constraints: 'unique, required', description: 'User email address' },
              { name: 'name', type: 'string', constraints: 'required', description: 'User display name' },
            ],
            relationships: [],
          },
        ],
      },
      apiDesign: {
        overview: 'REST API with standard CRUD endpoints for user management',
        endpoints: [
          { method: 'GET' as const, path: '/users', description: 'List all users', taskRef: 'TASK-003' },
          { method: 'POST' as const, path: '/users', description: 'Create a new user', taskRef: 'TASK-003' },
          { method: 'GET' as const, path: '/users/:id', description: 'Get a user by ID', taskRef: 'TASK-003' },
        ],
        authStrategy: 'JWT bearer token',
      },
      securityConsiderations: {
        overview: 'Basic security measures including input validation and authentication',
        threatModel: [
          {
            threat: 'SQL injection via user input',
            severity: 'high' as const,
            mitigation: 'Use Zod validation to sanitize all inputs before processing',
            taskRef: 'TASK-002',
          },
        ],
      },
      testingStrategy: {
        overview: 'Comprehensive unit testing with 80% coverage target',
        levels: [
          {
            name: 'unit' as const,
            description: 'Unit tests for all service methods and model validation',
            tools: ['vitest'],
            coverageTarget: '80%',
          },
        ],
        taskRefs: ['TASK-004'],
      },
      deploymentPlan: {
        overview: 'Standard Node.js deployment with environment configuration',
        environments: [
          { name: 'development', purpose: 'Local development environment', infrastructure: 'Docker Compose' },
          { name: 'production', purpose: 'Live production environment', infrastructure: 'Kubernetes' },
        ],
        cicdPipeline: 'GitHub Actions with automated testing and deployment',
      },
      riskAssessment: {
        risks: [
          {
            id: 'RISK-001',
            description: 'Scope creep during development may delay delivery timeline',
            probability: 'medium' as const,
            impact: 'minor' as const,
            mitigation: 'Strict scope management with regular reviews',
          },
        ],
      },
      timeline: {
        phases: [
          {
            name: 'Foundation',
            description: 'Set up project and core models',
            taskRefs: ['TASK-001', 'TASK-002'],
          },
          {
            name: 'Implementation',
            description: 'Build services and tests',
            taskRefs: ['TASK-003', 'TASK-004', 'TASK-005'],
          },
        ],
        criticalPath: ['TASK-001', 'TASK-002', 'TASK-003'],
      },
      glossary: {
        terms: [
          { term: 'CRUD', definition: 'Create, Read, Update, Delete — the four basic database operations' },
        ],
      },
      appendices: {
        adrs: [],
        references: [],
      },
    },
    tickets: [
      {
        frontmatter: {
          id: 'TASK-001',
          title: 'Set up project foundation',
          type: 'infrastructure' as const,
          priority: 'high' as const,
          estimate: '4h',
          dependencies: [],
          labels: ['setup'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Initialize the project with all required tooling, configuration files, and dependency management',
          acceptanceCriteria: [
            { given: 'A new developer clones the repo', when: 'They run npm install', then: 'All dependencies install without errors' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-002',
          title: 'Implement core data models',
          type: 'architecture' as const,
          priority: 'high' as const,
          estimate: '3h',
          dependencies: ['TASK-001'],
          labels: ['models'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Create all TypeScript interfaces and Zod schemas for the data layer with full validation coverage',
          acceptanceCriteria: [
            { given: 'Valid user data is passed to the schema', when: 'It is parsed by Zod', then: 'Parsing succeeds without errors' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-003',
          title: 'Implement user service',
          type: 'feature' as const,
          priority: 'high' as const,
          estimate: '6h',
          dependencies: ['TASK-002'],
          labels: ['service'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Build the user service with full CRUD operations and proper error handling throughout',
          acceptanceCriteria: [
            { given: 'A valid user object is provided', when: 'createUser is called', then: 'The user is created and returned with an id' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-004',
          title: 'Write unit tests',
          type: 'testing' as const,
          priority: 'medium' as const,
          estimate: '4h',
          dependencies: ['TASK-003'],
          labels: ['testing'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Implement comprehensive unit tests for all service and model code with edge case coverage',
          acceptanceCriteria: [
            { given: 'All test files are present', when: 'Tests are run', then: 'All tests pass with 80% coverage' },
          ],
          relatedDecisions: [],
        },
      },
      {
        frontmatter: {
          id: 'TASK-005',
          title: 'Write API documentation',
          type: 'documentation' as const,
          priority: 'medium' as const,
          estimate: '2h',
          dependencies: ['TASK-003'],
          labels: ['docs'],
          assignee: 'unassigned',
          status: 'backlog' as const,
        },
        body: {
          description: 'Create comprehensive API documentation including usage examples and integration guides for all endpoints',
          acceptanceCriteria: [
            { given: 'The documentation is complete', when: 'A developer reads it', then: 'They can integrate without additional help' },
          ],
          relatedDecisions: [],
        },
      },
    ],
    promptPacks: [
      {
        taskId: 'TASK-001',
        taskName: 'Set up project foundation',
        context: 'Initialize a TypeScript project with all required tooling and configuration for a user service application',
        contract: {
          outputFiles: [
            { filePath: 'package.json', exports: [], description: 'Package configuration with all dependencies' },
            { filePath: 'tsconfig.json', exports: [], description: 'TypeScript configuration for strict mode' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [],
        instructions: [
          { step: 1, instruction: 'Create package.json with Node.js and TypeScript dependencies and scripts' },
          { step: 2, instruction: 'Create tsconfig.json with strict TypeScript settings and ESM module support' },
        ],
        constraints: ['Use strict TypeScript settings', 'Enable ESM modules'],
        testCriteria: ['Package installs without errors', 'TypeScript compiles without errors'],
        estimatedComplexity: 'low' as const,
        suggestedModel: 'fast' as const,
        previousTaskOutputs: [],
      },
      {
        taskId: 'TASK-002',
        taskName: 'Implement core data models',
        context: 'Create TypeScript interfaces and Zod schemas for all data entities used in the user service',
        contract: {
          outputFiles: [
            { filePath: 'src/models/user.ts', exports: ['UserSchema', 'User'], description: 'User data model with Zod schema' },
            { filePath: 'src/models/index.ts', exports: ['UserSchema', 'User'], description: 'Model index exports' },
          ],
          exports: [],
          dependencies: [{ name: 'zod', version: '^3.0.0', purpose: 'Runtime schema validation' }],
        },
        inputFiles: [{ filePath: 'tsconfig.json', sourceTask: 'TASK-001' }],
        instructions: [
          { step: 1, instruction: 'Create the User interface with id, email, name, and createdAt fields' },
          { step: 2, instruction: 'Create Zod schemas for User validation with proper constraints' },
          { step: 3, instruction: 'Export all models from the index file' },
        ],
        constraints: ['All models must have Zod schemas', 'Use branded types for IDs'],
        testCriteria: ['Schemas validate correct data', 'Schemas reject invalid data with clear errors'],
        estimatedComplexity: 'medium' as const,
        suggestedModel: 'balanced' as const,
        previousTaskOutputs: [],
      },
      {
        taskId: 'TASK-003',
        taskName: 'Implement user service',
        context: 'Build the user service class with CRUD methods using the data models created in TASK-002',
        contract: {
          outputFiles: [
            { filePath: 'src/services/user-service.ts', exports: ['UserService'], description: 'User service with CRUD operations' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [
          { filePath: 'src/models/user.ts', sourceTask: 'TASK-002' },
          { filePath: 'src/models/index.ts', sourceTask: 'TASK-002' },
        ],
        instructions: [
          { step: 1, instruction: 'Create UserService class with in-memory storage for development' },
          { step: 2, instruction: 'Implement createUser, getUser, updateUser, deleteUser methods' },
          { step: 3, instruction: 'Add proper error handling and input validation' },
        ],
        constraints: ['Handle all error cases gracefully', 'Validate all inputs before processing'],
        testCriteria: ['All CRUD operations work', 'Invalid inputs are rejected'],
        estimatedComplexity: 'medium' as const,
        suggestedModel: 'balanced' as const,
        previousTaskOutputs: [
          { taskId: 'TASK-002', filePath: 'src/models/user.ts', injectionPoint: 'imports', mode: 'full' as const },
        ],
      },
      {
        taskId: 'TASK-004',
        taskName: 'Write unit tests',
        context: 'Create comprehensive unit tests for the user service and data models',
        contract: {
          outputFiles: [
            { filePath: 'tests/user-service.test.ts', exports: [], description: 'User service unit tests' },
            { filePath: 'tests/models.test.ts', exports: [], description: 'Model validation unit tests' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [
          { filePath: 'src/services/user-service.ts', sourceTask: 'TASK-003' },
          { filePath: 'src/models/user.ts', sourceTask: 'TASK-002' },
        ],
        instructions: [
          { step: 1, instruction: 'Write tests for all UserService CRUD operations' },
          { step: 2, instruction: 'Write tests for model schema validation with valid and invalid data' },
          { step: 3, instruction: 'Add edge case tests for error scenarios' },
        ],
        constraints: ['Achieve 80% code coverage', 'Test all error cases'],
        testCriteria: ['All tests pass', 'Coverage threshold is met'],
        estimatedComplexity: 'medium' as const,
        suggestedModel: 'balanced' as const,
        previousTaskOutputs: [
          { taskId: 'TASK-003', filePath: 'src/services/user-service.ts', injectionPoint: 'imports', mode: 'full' as const },
        ],
      },
      {
        taskId: 'TASK-005',
        taskName: 'Write API documentation',
        context: 'Create comprehensive API documentation for all user service endpoints',
        contract: {
          outputFiles: [
            { filePath: 'docs/api.md', exports: [], description: 'API documentation in Markdown format' },
          ],
          exports: [],
          dependencies: [],
        },
        inputFiles: [
          { filePath: 'src/services/user-service.ts', sourceTask: 'TASK-003' },
        ],
        instructions: [
          { step: 1, instruction: 'Document each API endpoint with method, path, parameters, and response' },
          { step: 2, instruction: 'Include request and response examples for each endpoint' },
          { step: 3, instruction: 'Add authentication and error handling sections' },
        ],
        constraints: ['Documentation must be complete and accurate'],
        testCriteria: ['All endpoints are documented', 'Examples are provided for each endpoint'],
        estimatedComplexity: 'low' as const,
        suggestedModel: 'fast' as const,
        previousTaskOutputs: [],
      },
    ],
    adrs: [],
  };
}

function createOrchestrator(
  registry: GateRegistry,
  config: ResolvedGateConfig,
): GateOrchestrator {
  return new GateOrchestrator({
    registry,
    config,
    logger: createMockLogger(),
    resilience: new ResilienceLayer({}),
    provider: createMockProvider(),
    model: 'mock-model',
    llmSemaphore: new Semaphore(5),
    validateCrossReferences,
  });
}

// ---------------------------------------------------------------------------
// Test Suite 1: All 5 gates run on valid artifacts
// ---------------------------------------------------------------------------

describe('GateOrchestrator — all 5 built-in gates', () => {
  let artifacts: ArtifactSet;

  beforeEach(() => {
    artifacts = buildValidArtifactSet();
  });

  it('runs all 5 gates and produces a GateReport', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const config = createDefaultConfig();
    const orchestrator = createOrchestrator(registry, config);

    const report = await orchestrator.run(artifacts);

    expect(report).toBeDefined();
    expect(report.gates).toHaveLength(5);
    expect(typeof report.overallScore).toBe('number');
    expect(typeof report.passed).toBe('boolean');
    expect(typeof report.duration).toBe('number');
    expect(report.timestamp).toBeInstanceOf(Date);
  });

  it('GateReport.gates contains results for all 5 built-in gate IDs', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const config = createDefaultConfig();
    const orchestrator = createOrchestrator(registry, config);

    const report = await orchestrator.run(artifacts);

    const gateIds = report.gates.map(g => g.gateId);
    expect(gateIds).toContain('security');
    expect(gateIds).toContain('buildability');
    expect(gateIds).toContain('consistency');
    expect(gateIds).toContain('coverage');
    expect(gateIds).toContain('testability');
  });

  it('overallScore is average of all gate scores', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const config = createDefaultConfig();
    const orchestrator = createOrchestrator(registry, config);

    const report = await orchestrator.run(artifacts);

    const expectedAvg = report.gates.reduce((sum, g) => sum + g.score, 0) / report.gates.length;
    expect(report.overallScore).toBeCloseTo(expectedAvg, 5);
  });

  it('each GateResult has required fields', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const config = createDefaultConfig();
    const orchestrator = createOrchestrator(registry, config);

    const report = await orchestrator.run(artifacts);

    for (const gate of report.gates) {
      expect(gate).toMatchObject({
        gateId: expect.any(String),
        score: expect.any(Number),
        passed: expect.any(Boolean),
        findings: expect.any(Array),
        fixes: expect.any(Array),
        durationMs: expect.any(Number),
      });
      expect(gate.score).toBeGreaterThanOrEqual(0);
      expect(gate.score).toBeLessThanOrEqual(1);
    }
  });

  it('overall score is between 0 and 1', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const config = createDefaultConfig();
    const orchestrator = createOrchestrator(registry, config);

    const report = await orchestrator.run(artifacts);

    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Disabled gates are excluded
// ---------------------------------------------------------------------------

describe('GateOrchestrator — disabled gates', () => {
  it('excludes disabled gates from execution', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const artifacts = buildValidArtifactSet();

    // Disable testability and coverage gates
    const config = createDefaultConfig({
      gates: {
        coverage: { enabled: false, threshold: 0.8, autoFix: false, rules: {} },
        consistency: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
        testability: { enabled: false, threshold: 0.8, autoFix: false, rules: {} },
        buildability: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
        security: { enabled: true, threshold: 0.0, autoFix: false, rules: {} },
      },
    });

    const orchestrator = createOrchestrator(registry, config);
    const report = await orchestrator.run(artifacts);

    // Only 3 gates should run
    expect(report.gates).toHaveLength(3);
    const gateIds = report.gates.map(g => g.gateId);
    expect(gateIds).not.toContain('coverage');
    expect(gateIds).not.toContain('testability');
    expect(gateIds).toContain('security');
    expect(gateIds).toContain('buildability');
    expect(gateIds).toContain('consistency');
  });

  it('returns passed=true with empty gate set and threshold=0', async () => {
    const registry = new GateRegistry([]);
    const artifacts = buildValidArtifactSet();
    const config = createDefaultConfig({
      threshold: 0,
      gates: {},
    });

    const orchestrator = createOrchestrator(registry, config);
    const report = await orchestrator.run(artifacts);

    expect(report.gates).toHaveLength(0);
    expect(report.overallScore).toBe(1.0); // No gates = perfect score
    expect(report.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: Pass/fail logic based on threshold
// ---------------------------------------------------------------------------

describe('GateOrchestrator — threshold logic', () => {
  it('marks overall as passed when all gate scores meet threshold', async () => {
    const artifacts = buildValidArtifactSet();

    // Use a single custom gate that always passes with score 1.0
    const perfectGate = {
      id: 'perfect',
      name: 'Perfect Gate',
      version: '1.0.0',
      priority: 0,
      fixable: false,
      async run() {
        return {
          gateId: 'perfect',
          score: 1.0,
          passed: true,
          findings: [],
          fixes: [],
          durationMs: 1,
        };
      },
    };

    const registry = new GateRegistry([perfectGate]);
    const config = createDefaultConfig({
      threshold: 0.8,
      gates: {
        perfect: { enabled: true, threshold: 0.8, autoFix: false, rules: {} },
      },
    });

    const orchestrator = createOrchestrator(registry, config);
    const report = await orchestrator.run(artifacts);

    expect(report.passed).toBe(true);
    expect(report.overallScore).toBe(1.0);
  });

  it('marks overall as failed when a gate fails', async () => {
    const artifacts = buildValidArtifactSet();

    const failingGate = {
      id: 'failing',
      name: 'Failing Gate',
      version: '1.0.0',
      priority: 0,
      fixable: false,
      async run() {
        return {
          gateId: 'failing',
          score: 0.3,
          passed: false,
          findings: [
            {
              ruleId: 'RULE-001',
              severity: 'error' as const,
              message: 'Simulated failure',
              location: {
                artifact: 'task_graph' as const,
                file: 'task_graph.yaml',
                path: ['tasks'],
              },
              fixable: false,
            },
          ],
          fixes: [],
          durationMs: 1,
        };
      },
    };

    const registry = new GateRegistry([failingGate]);
    const config = createDefaultConfig({
      threshold: 0.8,
      gates: {
        failing: { enabled: true, threshold: 0.8, autoFix: false, rules: {} },
      },
    });

    const orchestrator = createOrchestrator(registry, config);
    const report = await orchestrator.run(artifacts);

    expect(report.passed).toBe(false);
    expect(report.overallScore).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: fixesApplied and fixRoundsUsed
// ---------------------------------------------------------------------------

describe('GateOrchestrator — fix tracking', () => {
  it('reports fixesApplied=0 when autoFix is disabled', async () => {
    const registry = new GateRegistry(BUILTIN_GATES);
    const artifacts = buildValidArtifactSet();
    const config = createDefaultConfig({ autoFix: false, maxFixRounds: 0 });

    const orchestrator = createOrchestrator(registry, config);
    const report = await orchestrator.run(artifacts);

    expect(report.fixesApplied).toBe(0);
    expect(report.fixRoundsUsed).toBe(0);
  });
});
