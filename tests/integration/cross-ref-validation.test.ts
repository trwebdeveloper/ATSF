/**
 * Integration tests for CrossReferenceValidator — L3 cross-reference validation.
 *
 * Tests verify:
 * 1. All 13 XREF rules pass on a valid artifact set
 * 2. XREF-001: tasks without tickets and tickets without tasks are detected
 * 3. XREF-002: tasks without prompt packs and packs referencing missing tasks
 * 4. XREF-003: generatedBy references non-existent task IDs
 * 5. XREF-004: ticket dependencies inconsistent with task graph dependsOn
 * 6. XREF-005: inputFiles.sourceTask references non-existent task
 * 7. XREF-006: previousTaskOutputs.taskId references non-existent task
 * 8. XREF-007: MPD taskRefs reference non-existent tasks
 * 9. XREF-008: MPD pattern adrRefs not in appendices (warning)
 * 10. XREF-009: ticket relatedDecisions reference unknown ADRs (warning)
 * 11. XREF-010: PromptPack outputFiles not in task filesWrite
 * 12. XREF-011: PromptPack inputFiles not in task filesRead
 * 13. XREF-012: MPD criticalPath references non-existent task
 * 14. XREF-013: task filesWrite paths not covered by repo blueprint (warning)
 */

import { describe, it, expect } from 'vitest';
import {
  CrossReferenceValidator,
  validateCrossReferences,
} from '../../src/emitter/cross-ref-validator.js';
import type { ArtifactSet } from '../../src/emitter/cross-ref-validator.js';
import type {
  TaskGraphArtifact,
  RepoBlueprint,
  Mpd,
  Ticket,
  AiPromptPack,
  Adr,
} from '../../src/contracts/artifact-schemas.js';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const GENERATED_AT = '2026-01-01T00:00:00.000Z';
const CHECKSUM = 'sha256:' + 'a'.repeat(64);

// ---------------------------------------------------------------------------
// Valid fixture builders
// ---------------------------------------------------------------------------

function makeTaskGraph(): TaskGraphArtifact {
  return {
    version: '1.0',
    generated: GENERATED_AT,
    checksum: CHECKSUM,
    project: {
      name: 'cross-ref-test',
      description: 'Integration test project for cross-reference validation',
      constraints: ['TypeScript strict mode'],
    },
    tasks: [
      {
        id: 'TASK-001',
        name: 'Setup base module',
        description: 'Create the base module with core utilities and helper functions',
        agent: 'builder',
        type: 'feature',
        dependsOn: [],
        filesWrite: ['src/base.ts'],
        filesRead: [],
        priority: 4,
        acceptanceCriteria: [
          { description: 'Base module exports all required utilities correctly', testable: true },
        ],
        tags: ['core'],
      },
      {
        id: 'TASK-002',
        name: 'Create main entry point',
        description: 'Create the main entry point that imports from base module and re-exports public API',
        agent: 'builder',
        type: 'feature',
        dependsOn: ['TASK-001'],
        filesWrite: ['src/index.ts'],
        filesRead: ['src/base.ts'],
        priority: 3,
        acceptanceCriteria: [
          { description: 'Main entry point exports all public API symbols from the project', testable: true },
        ],
        tags: ['entry'],
      },
    ],
  };
}

function makeRepoBlueprint(): RepoBlueprint {
  return {
    version: '1.0',
    generated: GENERATED_AT,
    checksum: CHECKSUM,
    projectName: 'cross-ref-test',
    root: [
      {
        name: 'src',
        type: 'dir',
        purpose: 'Source code directory',
        children: [
          {
            name: 'base.ts',
            type: 'file',
            purpose: 'Base utilities module',
            generatedBy: 'TASK-001',
          },
          {
            name: 'index.ts',
            type: 'file',
            purpose: 'Main entry point',
            generatedBy: 'TASK-002',
          },
        ],
      },
    ],
  };
}

function makeMpd(): Mpd {
  return {
    version: '1.0',
    generated: GENERATED_AT,
    checksum: CHECKSUM,
    executiveSummary: {
      projectName: 'cross-ref-test',
      oneLiner: 'A test project exercising cross-reference validation between artifacts',
      objectives: ['Validate cross-reference integrity between all artifact types'],
      targetAudience: ['Test framework'],
      scope: {
        inScope: ['Cross-reference validation tests'],
        outOfScope: ['Production deployment of any kind'],
      },
    },
    projectOverview: {
      background: 'This project exercises the ATSF cross-reference validator integration test suite',
      problemStatement: 'We need to ensure cross-references between artifacts are always consistent',
      proposedSolution: 'Build a comprehensive test suite that exercises all 13 XREF rules in detail',
      successCriteria: ['All XREF rules pass on a correctly constructed artifact set'],
      assumptions: [],
    },
    technicalArchitecture: {
      overview: 'Simple two-layer architecture with base module and entry point connecting them together',
      diagrams: [
        {
          type: 'flowchart',
          title: 'Module Architecture',
          source: 'graph TD; Base-->Index;',
        },
      ],
      patterns: [
        {
          name: 'Module Pattern',
          rationale: 'Encapsulates functionality in well-defined modules for clean separation of concerns',
          adrRef: 'ADR-001',
        },
      ],
      techStack: [
        {
          name: 'TypeScript',
          purpose: 'Type-safe implementation',
          category: 'language',
        },
      ],
    },
    componentDesign: {
      components: [
        {
          name: 'Base Module',
          description: 'Core utilities and helpers providing foundational functionality for the project',
          responsibilities: ['Provide utility functions', 'Export core types and interfaces'],
          interfaces: [],
          dependencies: [],
          taskRefs: ['TASK-001'],
        },
        {
          name: 'Entry Point',
          description: 'Main entry point that aggregates and re-exports all public API symbols cleanly',
          responsibilities: ['Re-export public API', 'Provide stable public interface'],
          interfaces: [],
          dependencies: ['Base Module'],
          taskRefs: ['TASK-002'],
        },
      ],
    },
    dataModel: {
      overview: 'No persistent data model required for this utility module project',
      entities: [],
    },
    apiDesign: {
      overview: 'No external API for this module — purely internal utilities and types',
      endpoints: [
        {
          method: 'GET',
          path: '/health',
          description: 'Health check endpoint for the module',
          taskRef: 'TASK-001',
        },
      ],
    },
    securityConsiderations: {
      overview: 'No special security considerations for a utility module with no external interfaces',
      threatModel: [
        {
          threat: 'Dependency confusion attack via malicious npm packages',
          severity: 'medium',
          mitigation: 'Pin all dependency versions and use lock files',
          taskRef: 'TASK-002',
        },
      ],
    },
    testingStrategy: {
      overview: 'Unit tests validate each utility function in isolation for correctness',
      levels: [
        {
          name: 'unit',
          description: 'Unit tests for all utility functions ensuring correctness',
          tools: ['vitest'],
          coverageTarget: '80%',
        },
      ],
      taskRefs: ['TASK-001', 'TASK-002'],
    },
    deploymentPlan: {
      overview: 'Published as an npm package to the public registry for consumption',
      environments: [
        { name: 'npm registry', purpose: 'Public package distribution to consumers' },
      ],
    },
    riskAssessment: {
      risks: [
        {
          id: 'RISK-001',
          description: 'Breaking changes in the exported API may affect downstream consumers',
          probability: 'low',
          impact: 'minor',
          mitigation: 'Use semantic versioning and maintain backward compatibility at all times',
        },
      ],
    },
    timeline: {
      phases: [
        {
          name: 'Development',
          description: 'Implement all required modules',
          taskRefs: ['TASK-001', 'TASK-002'],
        },
      ],
      criticalPath: ['TASK-001', 'TASK-002'],
    },
    glossary: { terms: [] },
    appendices: {
      adrs: [
        {
          id: 'ADR-001',
          title: 'Use Module Pattern for code organization',
          status: 'accepted',
          summary: 'Adopt the module pattern to encapsulate functionality and maintain clean separation',
        },
      ],
      references: [],
    },
  };
}

function makeTickets(): Ticket[] {
  return [
    {
      frontmatter: {
        id: 'TASK-001',
        title: 'Setup base module',
        type: 'feature',
        priority: 'high',
        estimate: '2h',
        dependencies: [],
        labels: ['core'],
        assignee: 'unassigned',
        status: 'backlog',
      },
      body: {
        description: 'Create the base module with core utilities and helpers for the project infrastructure',
        acceptanceCriteria: [
          {
            given: 'The base module is imported into another module',
            when: 'Utility functions are called with valid inputs',
            then: 'They return correct and expected results',
          },
        ],
        relatedDecisions: ['ADR-001'],
      },
    },
    {
      frontmatter: {
        id: 'TASK-002',
        title: 'Create main entry point',
        type: 'feature',
        priority: 'medium',
        estimate: '1h',
        dependencies: ['TASK-001'],
        labels: ['entry'],
        assignee: 'unassigned',
        status: 'backlog',
      },
      body: {
        description: 'Create the main entry point that imports and re-exports from the base module cleanly',
        acceptanceCriteria: [
          {
            given: 'The package is imported by a consumer',
            when: 'Public API symbols are accessed via the entry point',
            then: 'All exports from base module are available and correctly typed',
          },
        ],
        relatedDecisions: [],
      },
    },
  ];
}

function makePromptPacks(): AiPromptPack[] {
  return [
    {
      taskId: 'TASK-001',
      taskName: 'Setup base module',
      context: 'Create the base module with core utilities and helper functions for the entire project',
      contract: {
        outputFiles: [
          {
            filePath: 'src/base.ts',
            exports: ['baseUtil'],
            description: 'Base utilities module with all core functions',
          },
        ],
        exports: [],
        dependencies: [],
      },
      inputFiles: [],
      instructions: [
        { step: 1, instruction: 'Create src/base.ts with all the required core utility functions' },
      ],
      constraints: ['Use TypeScript strict mode', 'Export all public utilities explicitly'],
      testCriteria: ['All utilities are exported correctly and accessible'],
      estimatedComplexity: 'low',
      suggestedModel: 'fast',
      previousTaskOutputs: [],
    },
    {
      taskId: 'TASK-002',
      taskName: 'Create main entry point',
      context: 'Create the main entry point that re-exports everything from the base module for consumers',
      contract: {
        outputFiles: [
          {
            filePath: 'src/index.ts',
            exports: ['baseUtil'],
            description: 'Main entry point re-exporting all public API symbols',
          },
        ],
        exports: [],
        dependencies: [],
      },
      inputFiles: [
        {
          filePath: 'src/base.ts',
          sourceTask: 'TASK-001',
          description: 'The base module that provides core utilities',
        },
      ],
      instructions: [
        { step: 1, instruction: 'Import all exports from the src/base.ts module' },
        { step: 2, instruction: 'Re-export them from the src/index.ts entry point module' },
      ],
      constraints: ['Re-export all public API symbols without modification'],
      testCriteria: ['All base module exports are accessible via the index entry point'],
      estimatedComplexity: 'trivial',
      suggestedModel: 'fast',
      previousTaskOutputs: [
        {
          taskId: 'TASK-001',
          filePath: 'src/base.ts',
          injectionPoint: 'imports',
          mode: 'full',
        },
      ],
    },
  ];
}

function makeAdrs(): Adr[] {
  return [
    {
      id: 'ADR-001',
      status: 'accepted',
      date: '2026-01-01',
      title: 'Use Module Pattern for code organization and separation of concerns',
      context: 'We need to decide how to organize code in the project to ensure maintainability and clarity',
      options: [
        {
          name: 'Module Pattern',
          description: 'Use ES modules with explicit exports and imports',
          pros: ['Clear boundaries', 'Tree-shakeable'],
          neutral: [],
          cons: ['Requires discipline'],
        },
        {
          name: 'Monolithic file',
          description: 'Put everything in a single file',
          pros: ['Simple to start'],
          neutral: [],
          cons: ['Harder to maintain as it grows'],
        },
      ],
      chosenOption: 'Module Pattern',
      rationale: 'The module pattern provides clear boundaries and better long-term maintainability',
      relatedTasks: ['TASK-001'],
    },
  ];
}

/**
 * Build a complete, fully-consistent ArtifactSet that satisfies all 13 XREF rules.
 */
function makeValidArtifactSet(): ArtifactSet {
  return {
    taskGraph: makeTaskGraph(),
    repoBlueprint: makeRepoBlueprint(),
    mpd: makeMpd(),
    tickets: makeTickets(),
    promptPacks: makePromptPacks(),
    adrs: makeAdrs(),
  };
}

// ---------------------------------------------------------------------------
// Test Suite 1: All 13 XREF rules pass on a valid artifact set
// ---------------------------------------------------------------------------

describe('CrossReferenceValidator — valid artifact set', () => {
  it('returns valid=true with no errors on a correctly constructed artifact set', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('produces no errors when all rules are satisfied', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const result = validator.validate(artifacts);

    expect(result.errors).toHaveLength(0);
    if (result.errors.length > 0) {
      // Helpful failure output listing which rules fired
      const ruleIds = result.errors.map(e => `${e.ruleId}: ${e.message}`).join('\n');
      throw new Error(`Expected no errors but got:\n${ruleIds}`);
    }
  });

  it('returns a CrossRefValidationResult with the expected shape', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('CrossReferenceValidator class produces same result as standalone function', () => {
    const artifacts = makeValidArtifactSet();
    const classResult = new CrossReferenceValidator().validate(artifacts);
    const fnResult = validateCrossReferences(artifacts);

    expect(classResult.valid).toBe(fnResult.valid);
    expect(classResult.errors).toHaveLength(fnResult.errors.length);
    expect(classResult.warnings).toHaveLength(fnResult.warnings.length);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: XREF-001 — TaskGraph-to-Tickets 1:1 mapping
// ---------------------------------------------------------------------------

describe('XREF-001: TaskGraph-to-Tickets 1:1 mapping', () => {
  it('detects a task with no corresponding ticket', () => {
    const artifacts = makeValidArtifactSet();
    // Remove ticket for TASK-001 — TASK-001 now has no ticket
    artifacts.tickets = artifacts.tickets.filter(t => t.frontmatter.id !== 'TASK-001');

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref001 = result.errors.filter(e => e.ruleId === 'XREF-001');
    expect(xref001.length).toBeGreaterThan(0);
    expect(xref001[0].offendingValues).toContain('TASK-001');
  });

  it('detects a ticket referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Add an orphan ticket for a task that does not exist in task graph
    artifacts.tickets.push({
      frontmatter: {
        id: 'TASK-999',
        title: 'Orphan ticket with no matching task',
        type: 'feature',
        priority: 'low',
        estimate: '1h',
        dependencies: [],
        labels: [],
        assignee: 'unassigned',
        status: 'backlog',
      },
      body: {
        description: 'This ticket references a task that does not exist in the task graph at all',
        acceptanceCriteria: [
          {
            given: 'The orphan ticket exists',
            when: 'Cross-reference validation is run',
            then: 'XREF-001 violation is reported for TASK-999',
          },
        ],
        relatedDecisions: [],
      },
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref001 = result.errors.filter(e => e.ruleId === 'XREF-001');
    expect(xref001.length).toBeGreaterThan(0);
    expect(xref001[0].offendingValues).toContain('TASK-999');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: XREF-002 — TaskGraph-to-PromptPack 1:1 mapping
// ---------------------------------------------------------------------------

describe('XREF-002: TaskGraph-to-PromptPack 1:1 mapping', () => {
  it('detects a task with no corresponding prompt pack', () => {
    const artifacts = makeValidArtifactSet();
    // Remove prompt pack for TASK-002
    artifacts.promptPacks = artifacts.promptPacks.filter(p => p.taskId !== 'TASK-002');

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref002 = result.errors.filter(e => e.ruleId === 'XREF-002');
    expect(xref002.length).toBeGreaterThan(0);
    expect(xref002[0].offendingValues).toContain('TASK-002');
  });

  it('detects a prompt pack referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Add a dangling prompt pack
    artifacts.promptPacks.push({
      taskId: 'TASK-999',
      taskName: 'Ghost task prompt pack',
      context: 'This prompt pack references a task that does not exist anywhere in the task graph artifact',
      contract: {
        outputFiles: [
          { filePath: 'src/ghost.ts', exports: [], description: 'A ghost file for a non-existent task' },
        ],
        exports: [],
        dependencies: [],
      },
      inputFiles: [],
      instructions: [
        { step: 1, instruction: 'This instruction belongs to a non-existent task in the graph' },
      ],
      constraints: ['No valid constraints since this task does not exist'],
      testCriteria: ['No valid test criteria since this task does not exist'],
      estimatedComplexity: 'low',
      suggestedModel: 'fast',
      previousTaskOutputs: [],
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref002 = result.errors.filter(e => e.ruleId === 'XREF-002');
    expect(xref002.length).toBeGreaterThan(0);
    expect(xref002[0].offendingValues).toContain('TASK-999');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: XREF-003 — RepoBlueprint generatedBy references TaskGraph
// ---------------------------------------------------------------------------

describe('XREF-003: RepoBlueprint generatedBy references TaskGraph', () => {
  it('detects generatedBy referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Point the base.ts file to a non-existent task
    artifacts.repoBlueprint = {
      ...artifacts.repoBlueprint,
      root: [
        {
          name: 'src',
          type: 'dir',
          purpose: 'Source directory',
          children: [
            {
              name: 'base.ts',
              type: 'file',
              purpose: 'Base utilities',
              generatedBy: 'TASK-999', // Non-existent task
            },
            {
              name: 'index.ts',
              type: 'file',
              purpose: 'Entry point',
              generatedBy: 'TASK-002',
            },
          ],
        },
      ],
    };

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref003 = result.errors.filter(e => e.ruleId === 'XREF-003');
    expect(xref003.length).toBeGreaterThan(0);
    expect(xref003[0].offendingValues).toContain('TASK-999');
  });

  it('passes when generatedBy is omitted from a file node', () => {
    const artifacts = makeValidArtifactSet();
    // Remove generatedBy from one node — should still be valid
    artifacts.repoBlueprint = {
      ...artifacts.repoBlueprint,
      root: [
        {
          name: 'src',
          type: 'dir',
          purpose: 'Source directory',
          children: [
            {
              name: 'base.ts',
              type: 'file',
              purpose: 'Base utilities',
              // No generatedBy — this is optional
            },
            {
              name: 'index.ts',
              type: 'file',
              purpose: 'Entry point',
              generatedBy: 'TASK-002',
            },
          ],
        },
      ],
    };

    const result = validateCrossReferences(artifacts);

    const xref003 = result.errors.filter(e => e.ruleId === 'XREF-003');
    expect(xref003).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: XREF-004 — Ticket dependencies match TaskGraph dependsOn
// ---------------------------------------------------------------------------

describe('XREF-004: Ticket dependencies match TaskGraph dependsOn', () => {
  it('detects a ticket with extra dependencies not in task graph', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-002 depends on TASK-001 in the graph, but add an extra dep in the ticket
    artifacts.tickets = artifacts.tickets.map(t => {
      if (t.frontmatter.id === 'TASK-002') {
        return {
          ...t,
          frontmatter: {
            ...t.frontmatter,
            dependencies: ['TASK-001', 'TASK-999'], // TASK-999 doesn't exist
          },
        };
      }
      return t;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref004 = result.errors.filter(e => e.ruleId === 'XREF-004');
    expect(xref004.length).toBeGreaterThan(0);
  });

  it('detects a ticket missing dependencies present in task graph', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-002 depends on TASK-001 in the graph, but ticket says no dependencies
    artifacts.tickets = artifacts.tickets.map(t => {
      if (t.frontmatter.id === 'TASK-002') {
        return {
          ...t,
          frontmatter: {
            ...t.frontmatter,
            dependencies: [], // Missing TASK-001
          },
        };
      }
      return t;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref004 = result.errors.filter(e => e.ruleId === 'XREF-004');
    expect(xref004.length).toBeGreaterThan(0);
  });

  it('passes when ticket dependencies exactly match task graph dependsOn', () => {
    const artifacts = makeValidArtifactSet();
    // Valid set already satisfies this
    const result = validateCrossReferences(artifacts);
    const xref004 = result.errors.filter(e => e.ruleId === 'XREF-004');
    expect(xref004).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: XREF-005 — PromptPack inputFiles.sourceTask references TaskGraph
// ---------------------------------------------------------------------------

describe('XREF-005: PromptPack inputFiles.sourceTask references TaskGraph', () => {
  it('detects inputFiles.sourceTask referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Make TASK-002 prompt pack reference a non-existent source task
    artifacts.promptPacks = artifacts.promptPacks.map(p => {
      if (p.taskId === 'TASK-002') {
        return {
          ...p,
          inputFiles: [
            {
              filePath: 'src/base.ts',
              sourceTask: 'TASK-999' as 'TASK-001', // Non-existent task
              description: 'Invalid source task reference',
            },
          ],
        };
      }
      return p;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref005 = result.errors.filter(e => e.ruleId === 'XREF-005');
    expect(xref005.length).toBeGreaterThan(0);
    expect(xref005[0].offendingValues).toContain('TASK-999');
  });

  it('passes when inputFiles.sourceTask references an existing task', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref005 = result.errors.filter(e => e.ruleId === 'XREF-005');
    expect(xref005).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 7: XREF-006 — PromptPack previousTaskOutputs.taskId references TaskGraph
// ---------------------------------------------------------------------------

describe('XREF-006: PromptPack previousTaskOutputs.taskId references TaskGraph', () => {
  it('detects previousTaskOutputs.taskId referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Make TASK-002 prompt pack reference a non-existent previous task
    artifacts.promptPacks = artifacts.promptPacks.map(p => {
      if (p.taskId === 'TASK-002') {
        return {
          ...p,
          previousTaskOutputs: [
            {
              taskId: 'TASK-999' as 'TASK-001', // Non-existent
              filePath: 'src/base.ts',
              injectionPoint: 'imports',
              mode: 'full' as const,
            },
          ],
        };
      }
      return p;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref006 = result.errors.filter(e => e.ruleId === 'XREF-006');
    expect(xref006.length).toBeGreaterThan(0);
    expect(xref006[0].offendingValues).toContain('TASK-999');
  });

  it('passes when previousTaskOutputs.taskId references existing tasks', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref006 = result.errors.filter(e => e.ruleId === 'XREF-006');
    expect(xref006).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 8: XREF-007 — MPD taskRefs reference TaskGraph
// ---------------------------------------------------------------------------

describe('XREF-007: MPD taskRefs reference TaskGraph', () => {
  it('detects component taskRefs referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    // Change a component taskRef to reference a ghost task
    artifacts.mpd = {
      ...artifacts.mpd,
      componentDesign: {
        ...artifacts.mpd.componentDesign,
        components: [
          {
            ...artifacts.mpd.componentDesign.components[0],
            taskRefs: ['TASK-999' as 'TASK-001'], // Non-existent
          },
          artifacts.mpd.componentDesign.components[1],
        ],
      },
    };

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref007 = result.errors.filter(e => e.ruleId === 'XREF-007');
    expect(xref007.length).toBeGreaterThan(0);
    expect(xref007[0].offendingValues).toContain('TASK-999');
  });

  it('detects testingStrategy.taskRefs referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    artifacts.mpd = {
      ...artifacts.mpd,
      testingStrategy: {
        ...artifacts.mpd.testingStrategy,
        taskRefs: ['TASK-001', 'TASK-999' as 'TASK-001'],
      },
    };

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref007 = result.errors.filter(e => e.ruleId === 'XREF-007');
    expect(xref007.length).toBeGreaterThan(0);
    expect(xref007[0].offendingValues).toContain('TASK-999');
  });

  it('detects timeline.phases taskRefs referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    artifacts.mpd = {
      ...artifacts.mpd,
      timeline: {
        ...artifacts.mpd.timeline,
        phases: [
          {
            name: 'Phase 1',
            description: 'First phase of development',
            taskRefs: ['TASK-001', 'TASK-999' as 'TASK-001'], // TASK-999 doesn't exist
          },
        ],
      },
    };

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref007 = result.errors.filter(e => e.ruleId === 'XREF-007');
    expect(xref007.length).toBeGreaterThan(0);
  });

  it('passes when all MPD taskRefs reference existing tasks', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref007 = result.errors.filter(e => e.ruleId === 'XREF-007');
    expect(xref007).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 9: XREF-008 — MPD ADR refs match Appendices (warning)
// ---------------------------------------------------------------------------

describe('XREF-008: MPD ADR refs match Appendices (warning)', () => {
  it('emits a warning when a pattern adrRef does not match any appendix ADR', () => {
    const artifacts = makeValidArtifactSet();
    // Add a pattern with an adrRef that is not in appendices.adrs
    artifacts.mpd = {
      ...artifacts.mpd,
      technicalArchitecture: {
        ...artifacts.mpd.technicalArchitecture,
        patterns: [
          {
            name: 'Module Pattern',
            rationale: 'Encapsulates functionality in well-defined modules for clean separation of concerns',
            adrRef: 'ADR-999', // Not in appendices
          },
        ],
      },
    };

    const result = validateCrossReferences(artifacts);

    // XREF-008 is a warning, not an error — valid should still be true if no other errors
    const xref008 = result.warnings.filter(w => w.ruleId === 'XREF-008');
    expect(xref008.length).toBeGreaterThan(0);
    expect(xref008[0].severity).toBe('warning');
    expect(xref008[0].offendingValues).toContain('ADR-999');
  });

  it('does not warn when all pattern adrRefs are in appendices', () => {
    const artifacts = makeValidArtifactSet();
    // ADR-001 is already in appendices.adrs in the valid set
    const result = validateCrossReferences(artifacts);
    const xref008 = result.warnings.filter(w => w.ruleId === 'XREF-008');
    expect(xref008).toHaveLength(0);
  });

  it('does not warn when patterns have no adrRef at all', () => {
    const artifacts = makeValidArtifactSet();
    artifacts.mpd = {
      ...artifacts.mpd,
      technicalArchitecture: {
        ...artifacts.mpd.technicalArchitecture,
        patterns: [
          {
            name: 'Module Pattern',
            rationale: 'Encapsulates functionality in well-defined modules for clean separation of concerns',
            // No adrRef
          },
        ],
      },
    };

    const result = validateCrossReferences(artifacts);
    const xref008 = result.warnings.filter(w => w.ruleId === 'XREF-008');
    expect(xref008).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 10: XREF-009 — Ticket relatedDecisions reference ADRs (warning)
// ---------------------------------------------------------------------------

describe('XREF-009: Ticket relatedDecisions reference ADRs (warning)', () => {
  it('emits a warning when a ticket relatedDecision references an unknown ADR', () => {
    const artifacts = makeValidArtifactSet();
    // Make TASK-001 ticket reference a non-existent ADR
    artifacts.tickets = artifacts.tickets.map(t => {
      if (t.frontmatter.id === 'TASK-001') {
        return {
          ...t,
          body: {
            ...t.body,
            relatedDecisions: ['ADR-999' as 'ADR-001'], // Not in adrs
          },
        };
      }
      return t;
    });

    const result = validateCrossReferences(artifacts);

    // XREF-009 is a warning
    const xref009 = result.warnings.filter(w => w.ruleId === 'XREF-009');
    expect(xref009.length).toBeGreaterThan(0);
    expect(xref009[0].severity).toBe('warning');
    expect(xref009[0].offendingValues).toContain('ADR-999');
  });

  it('does not warn when relatedDecisions reference existing ADRs', () => {
    const artifacts = makeValidArtifactSet();
    // Valid set has TASK-001 referencing ADR-001 which exists in adrs
    const result = validateCrossReferences(artifacts);
    const xref009 = result.warnings.filter(w => w.ruleId === 'XREF-009');
    expect(xref009).toHaveLength(0);
  });

  it('does not warn when relatedDecisions is empty', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-002 has empty relatedDecisions in the valid set
    const result = validateCrossReferences(artifacts);
    const xref009 = result.warnings.filter(w => w.ruleId === 'XREF-009');
    expect(xref009).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 11: XREF-010 — PromptPack outputFiles match TaskGraph filesWrite
// ---------------------------------------------------------------------------

describe('XREF-010: PromptPack contract.outputFiles match TaskGraph filesWrite', () => {
  it('detects outputFiles not present in task filesWrite', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-001 writes src/base.ts, but prompt pack output says src/other.ts
    artifacts.promptPacks = artifacts.promptPacks.map(p => {
      if (p.taskId === 'TASK-001') {
        return {
          ...p,
          contract: {
            ...p.contract,
            outputFiles: [
              {
                filePath: 'src/other.ts', // Not in TASK-001.filesWrite
                exports: [],
                description: 'A file not listed in task filesWrite',
              },
            ],
          },
        };
      }
      return p;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref010 = result.errors.filter(e => e.ruleId === 'XREF-010');
    expect(xref010.length).toBeGreaterThan(0);
    expect(xref010[0].offendingValues).toContain('src/other.ts');
  });

  it('passes when all outputFiles are in task filesWrite', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref010 = result.errors.filter(e => e.ruleId === 'XREF-010');
    expect(xref010).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 12: XREF-011 — PromptPack inputFiles match TaskGraph filesRead
// ---------------------------------------------------------------------------

describe('XREF-011: PromptPack inputFiles.filePath match TaskGraph filesRead', () => {
  it('detects inputFiles.filePath not present in task filesRead', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-002 reads src/base.ts, but prompt pack input says src/unknown.ts
    artifacts.promptPacks = artifacts.promptPacks.map(p => {
      if (p.taskId === 'TASK-002') {
        return {
          ...p,
          inputFiles: [
            {
              filePath: 'src/unknown.ts', // Not in TASK-002.filesRead
              sourceTask: 'TASK-001',
              description: 'A file not listed in task filesRead',
            },
          ],
        };
      }
      return p;
    });

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref011 = result.errors.filter(e => e.ruleId === 'XREF-011');
    expect(xref011.length).toBeGreaterThan(0);
    expect(xref011[0].offendingValues).toContain('src/unknown.ts');
  });

  it('passes when all inputFiles.filePath are in task filesRead', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref011 = result.errors.filter(e => e.ruleId === 'XREF-011');
    expect(xref011).toHaveLength(0);
  });

  it('passes when inputFiles is empty and filesRead is also empty', () => {
    const artifacts = makeValidArtifactSet();
    // TASK-001 has no inputFiles and no filesRead
    const result = validateCrossReferences(artifacts);
    const xref011 = result.errors.filter(e => e.ruleId === 'XREF-011');
    expect(xref011).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 13: XREF-012 — MPD criticalPath tasks exist in TaskGraph
// ---------------------------------------------------------------------------

describe('XREF-012: MPD timeline.criticalPath tasks exist in TaskGraph', () => {
  it('detects criticalPath referencing a non-existent task', () => {
    const artifacts = makeValidArtifactSet();
    artifacts.mpd = {
      ...artifacts.mpd,
      timeline: {
        ...artifacts.mpd.timeline,
        criticalPath: ['TASK-001', 'TASK-999' as 'TASK-001'], // TASK-999 doesn't exist
      },
    };

    const result = validateCrossReferences(artifacts);

    expect(result.valid).toBe(false);
    const xref012 = result.errors.filter(e => e.ruleId === 'XREF-012');
    expect(xref012.length).toBeGreaterThan(0);
    expect(xref012[0].offendingValues).toContain('TASK-999');
  });

  it('passes when all criticalPath task IDs exist in task graph', () => {
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    const xref012 = result.errors.filter(e => e.ruleId === 'XREF-012');
    expect(xref012).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 14: XREF-013 — RepoBlueprint files cover TaskGraph filesWrite (warning)
// ---------------------------------------------------------------------------

describe('XREF-013: RepoBlueprint files cover TaskGraph filesWrite (warning)', () => {
  it('emits a warning when a task filesWrite path is not in the repo blueprint', () => {
    const artifacts = makeValidArtifactSet();
    // Add a task that writes a file not present in the repo blueprint
    artifacts.taskGraph = {
      ...artifacts.taskGraph,
      tasks: [
        ...artifacts.taskGraph.tasks,
        {
          id: 'TASK-003',
          name: 'Create config file not in blueprint',
          description: 'Creates a configuration file that is not represented in the repo blueprint structure',
          agent: 'builder',
          type: 'infrastructure',
          dependsOn: ['TASK-001'],
          filesWrite: ['config/settings.json'], // Not in repo blueprint
          filesRead: [],
          priority: 2,
          acceptanceCriteria: [
            { description: 'Config file is created with correct default settings values', testable: true },
          ],
          tags: ['config'],
        },
      ],
    };
    // Add matching ticket and prompt pack to keep XREF-001 and XREF-002 happy
    artifacts.tickets.push({
      frontmatter: {
        id: 'TASK-003',
        title: 'Create config file',
        type: 'task',
        priority: 'low',
        estimate: '1h',
        dependencies: ['TASK-001'],
        labels: [],
        assignee: 'unassigned',
        status: 'backlog',
      },
      body: {
        description: 'Creates a configuration file that is not in the repo blueprint for testing warnings',
        acceptanceCriteria: [
          {
            given: 'The task runs in the pipeline',
            when: 'Cross-reference validation checks the repo blueprint coverage',
            then: 'A XREF-013 warning is emitted for the uncovered filesWrite path',
          },
        ],
        relatedDecisions: [],
      },
    });
    artifacts.promptPacks.push({
      taskId: 'TASK-003',
      taskName: 'Create config file not in blueprint',
      context: 'Creates a configuration file that is intentionally not represented in the repo blueprint',
      contract: {
        outputFiles: [
          {
            filePath: 'config/settings.json',
            exports: [],
            description: 'Configuration settings file not in repo blueprint',
          },
        ],
        exports: [],
        dependencies: [],
      },
      inputFiles: [],
      instructions: [
        { step: 1, instruction: 'Create config/settings.json with default configuration values' },
      ],
      constraints: ['Must be valid JSON format'],
      testCriteria: ['Config file has correct default values for all settings'],
      estimatedComplexity: 'trivial',
      suggestedModel: 'fast',
      previousTaskOutputs: [],
    });

    const result = validateCrossReferences(artifacts);

    // XREF-013 is a warning
    const xref013 = result.warnings.filter(w => w.ruleId === 'XREF-013');
    expect(xref013.length).toBeGreaterThan(0);
    expect(xref013[0].severity).toBe('warning');
    expect(xref013[0].offendingValues).toContain('config/settings.json');
  });

  it('does not warn when all task filesWrite paths are in the repo blueprint', () => {
    const artifacts = makeValidArtifactSet();
    // Valid set: src/base.ts and src/index.ts are both in the blueprint
    const result = validateCrossReferences(artifacts);
    const xref013 = result.warnings.filter(w => w.ruleId === 'XREF-013');
    expect(xref013).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 15: Violation shape
// ---------------------------------------------------------------------------

describe('CrossRefViolation shape', () => {
  it('each error violation has the expected shape', () => {
    const artifacts = makeValidArtifactSet();
    // Remove all tickets to trigger XREF-001
    artifacts.tickets = [];

    const result = validateCrossReferences(artifacts);
    expect(result.errors.length).toBeGreaterThan(0);

    for (const violation of result.errors) {
      expect(violation).toHaveProperty('ruleId');
      expect(violation).toHaveProperty('ruleName');
      expect(violation).toHaveProperty('severity');
      expect(violation).toHaveProperty('message');
      expect(violation).toHaveProperty('offendingValues');
      expect(typeof violation.ruleId).toBe('string');
      expect(typeof violation.ruleName).toBe('string');
      expect(typeof violation.message).toBe('string');
      expect(violation.severity).toBe('error');
      expect(Array.isArray(violation.offendingValues)).toBe(true);
    }
  });

  it('each warning violation has severity="warning"', () => {
    const artifacts = makeValidArtifactSet();
    // Trigger XREF-008 warning — pattern adrRef not in appendices
    artifacts.mpd = {
      ...artifacts.mpd,
      technicalArchitecture: {
        ...artifacts.mpd.technicalArchitecture,
        patterns: [
          {
            name: 'Pattern A',
            rationale: 'Uses pattern A for well-defined module encapsulation and separation of concerns',
            adrRef: 'ADR-999', // Not in appendices
          },
        ],
      },
    };

    const result = validateCrossReferences(artifacts);

    for (const warning of result.warnings) {
      expect(warning.severity).toBe('warning');
    }
  });

  it('valid=false when there are errors, regardless of warnings', () => {
    const artifacts = makeValidArtifactSet();
    // Remove a ticket (error) and also trigger a warning
    artifacts.tickets = artifacts.tickets.filter(t => t.frontmatter.id !== 'TASK-001');
    artifacts.mpd = {
      ...artifacts.mpd,
      technicalArchitecture: {
        ...artifacts.mpd.technicalArchitecture,
        patterns: [
          {
            name: 'Pattern',
            rationale: 'Uses a pattern for module encapsulation and clean separation of concerns',
            adrRef: 'ADR-999', // Warning
          },
        ],
      },
    };

    const result = validateCrossReferences(artifacts);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
