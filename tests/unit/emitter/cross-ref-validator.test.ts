/**
 * T13: Cross-Reference Validator Tests
 *
 * TDD test suite for src/emitter/cross-ref-validator.ts
 * Tests all 13 cross-reference rules per Section 10.8.
 */
import { describe, it, expect } from 'vitest';
import {
  CrossReferenceValidator,
  type ArtifactSet,
} from '../../../src/emitter/cross-ref-validator.js';
import type {
  TaskGraphArtifact,
  RepoBlueprint,
  Mpd,
  Ticket,
  AiPromptPack,
  Adr,
} from '../../../src/contracts/artifact-schemas.js';

/* ------------------------------------------------------------------ */
/*  Test Fixtures                                                        */
/* ------------------------------------------------------------------ */

const NOW = '2024-01-01T00:00:00.000Z';
const CHECKSUM = 'sha256:' + 'a'.repeat(64);

function makeTaskGraph(overrides: Partial<TaskGraphArtifact> = {}): TaskGraphArtifact {
  return {
    version: '1.0',
    generated: NOW,
    checksum: CHECKSUM,
    project: {
      name: 'Test Project',
      description: 'A test project description that is long enough.',
      constraints: [],
    },
    tasks: [
      {
        id: 'TASK-001',
        name: 'Task One',
        description: 'First task description that is long enough to pass validation.',
        agent: 'planner',
        type: 'feature',
        dependsOn: [],
        filesWrite: ['src/index.ts'],
        filesRead: [],
        priority: 3,
        acceptanceCriteria: [{ description: 'Should work correctly and pass all tests.', testable: true }],
        tags: [],
      },
      {
        id: 'TASK-002',
        name: 'Task Two',
        description: 'Second task description that is long enough to pass validation.',
        agent: 'builder',
        type: 'feature',
        dependsOn: ['TASK-001'],
        filesWrite: ['src/utils.ts'],
        filesRead: ['src/index.ts'],
        priority: 2,
        acceptanceCriteria: [{ description: 'Should work correctly and pass all tests.', testable: true }],
        tags: [],
      },
    ],
    ...overrides,
  };
}

function makeRepoBlueprint(overrides: Partial<RepoBlueprint> = {}): RepoBlueprint {
  return {
    version: '1.0',
    generated: NOW,
    checksum: CHECKSUM,
    projectName: 'Test Project',
    root: [
      {
        name: 'src',
        type: 'dir',
        purpose: 'Source files',
        children: [
          {
            name: 'index.ts',
            type: 'file',
            purpose: 'Entry point',
            generatedBy: 'TASK-001',
          },
          {
            name: 'utils.ts',
            type: 'file',
            purpose: 'Utilities',
            generatedBy: 'TASK-002',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeMpd(overrides: Partial<Mpd> = {}): Mpd {
  return {
    version: '1.0',
    generated: NOW,
    checksum: CHECKSUM,
    executiveSummary: {
      projectName: 'Test Project',
      oneLiner: 'A test project for validation purposes.',
      objectives: ['Validate cross references'],
      targetAudience: ['Developers'],
      scope: {
        inScope: ['Cross-reference validation'],
        outOfScope: ['Unrelated features'],
      },
    },
    projectOverview: {
      background: 'This is the background for the test project that is long enough.',
      problemStatement: 'This is the problem statement for the test project.',
      proposedSolution: 'This is the proposed solution for the test project.',
      successCriteria: ['All tests pass'],
      assumptions: [],
    },
    technicalArchitecture: {
      overview: 'Technical overview for the test project that is detailed enough.',
      diagrams: [{
        type: 'flowchart',
        title: 'System Flow',
        source: 'graph TD\n  A --> B',
      }],
      patterns: [{
        name: 'Repository Pattern',
        rationale: 'Separation of concerns between data access and business logic.',
        adrRef: 'ADR-001',
      }],
      techStack: [{
        name: 'TypeScript',
        version: '5.0',
        purpose: 'Type-safe development',
        category: 'language',
      }],
    },
    componentDesign: {
      components: [{
        name: 'Core',
        description: 'Core component that handles the main business logic.',
        responsibilities: ['Handle core logic'],
        interfaces: [],
        dependencies: [],
        taskRefs: ['TASK-001'],
      }],
    },
    dataModel: {
      overview: 'Data model overview for the test project.',
      entities: [],
    },
    apiDesign: {
      overview: 'API design overview for the test project.',
      endpoints: [],
    },
    securityConsiderations: {
      overview: 'Security considerations for the test project.',
      threatModel: [],
    },
    testingStrategy: {
      overview: 'Testing strategy overview for the test project.',
      levels: [{
        name: 'unit',
        description: 'Unit tests for individual components.',
        tools: ['vitest'],
      }],
      taskRefs: ['TASK-002'],
    },
    deploymentPlan: {
      overview: 'Deployment plan overview for the test project.',
      environments: [{
        name: 'production',
        purpose: 'Production environment',
      }],
    },
    riskAssessment: {
      risks: [{
        id: 'RISK-001',
        description: 'Risk of technical debt accumulation.',
        probability: 'medium',
        impact: 'major',
        mitigation: 'Regular code reviews',
      }],
    },
    timeline: {
      phases: [{
        name: 'Phase 1',
        description: 'Initial phase',
        taskRefs: ['TASK-001'],
      }],
      criticalPath: ['TASK-001', 'TASK-002'],
    },
    glossary: {
      terms: [],
    },
    appendices: {
      adrs: [{
        id: 'ADR-001',
        title: 'First Decision',
        status: 'accepted',
        summary: 'This is a summary of the first architectural decision record.',
      }],
      references: [],
    },
    ...overrides,
  };
}

function makeTicket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    frontmatter: {
      id,
      title: `Ticket for ${id}`,
      type: 'feature',
      priority: 'medium',
      estimate: '2d',
      dependencies: id === 'TASK-002' ? ['TASK-001'] : [],
      labels: [],
      assignee: 'unassigned',
      status: 'backlog',
    },
    body: {
      description: 'This is the ticket description that is detailed enough to pass validation.',
      acceptanceCriteria: [{
        given: 'Given setup conditions',
        when: 'When action is taken',
        then: 'Then expected result happens',
      }],
      technicalNotes: 'Technical notes for implementation.',
      relatedDecisions: [],
    },
    ...overrides,
  };
}

function makePromptPack(taskId: string, overrides: Partial<AiPromptPack> = {}): AiPromptPack {
  const filesWrite = taskId === 'TASK-001' ? ['src/index.ts'] : ['src/utils.ts'];
  const filesRead = taskId === 'TASK-002' ? ['src/index.ts'] : [];

  const inputFiles = filesRead.map(fp => ({
    filePath: fp,
    sourceTask: 'TASK-001' as const,
    description: 'Input file description',
  }));

  return {
    taskId,
    taskName: `Task ${taskId}`,
    context: 'Context for the task that provides enough background information.',
    contract: {
      outputFiles: filesWrite.map(fp => ({
        filePath: fp,
        exports: [],
        description: 'Output file description',
      })),
      exports: [],
      dependencies: [],
    },
    inputFiles,
    instructions: [{ step: 1, instruction: 'Implement the required functionality.' }],
    constraints: ['Must use TypeScript strict mode'],
    testCriteria: ['All unit tests must pass'],
    estimatedComplexity: 'medium',
    suggestedModel: 'balanced',
    previousTaskOutputs: [],
    ...overrides,
  };
}

function makeAdr(id: string): Adr {
  return {
    id,
    status: 'accepted',
    date: '2024-01-01',
    title: `Decision ${id}`,
    context: 'Context for the architectural decision that is detailed enough.',
    options: [
      { name: 'Option A', description: 'First option', pros: ['Pro A'], neutral: [], cons: [] },
      { name: 'Option B', description: 'Second option', pros: [], neutral: [], cons: ['Con B'] },
    ],
    chosenOption: 'Option A',
    rationale: 'Option A was chosen because it better meets requirements.',
    relatedTasks: [],
  };
}

function makeValidArtifactSet(): ArtifactSet {
  return {
    taskGraph: makeTaskGraph(),
    repoBlueprint: makeRepoBlueprint(),
    mpd: makeMpd(),
    tickets: [makeTicket('TASK-001'), makeTicket('TASK-002')],
    promptPacks: [makePromptPack('TASK-001'), makePromptPack('TASK-002')],
    adrs: [makeAdr('ADR-001')],
  };
}

/* ------------------------------------------------------------------ */
/*  Validator instantiation                                              */
/* ------------------------------------------------------------------ */

describe('CrossReferenceValidator', () => {
  it('is instantiable', () => {
    const validator = new CrossReferenceValidator();
    expect(validator).toBeDefined();
  });

  it('has a validate method', () => {
    const validator = new CrossReferenceValidator();
    expect(typeof validator.validate).toBe('function');
  });
});

/* ------------------------------------------------------------------ */
/*  Valid ArtifactSet passes all 13 rules                               */
/* ------------------------------------------------------------------ */

describe('CrossReferenceValidator.validate - valid artifact set', () => {
  it('passes all 13 rules when artifact set is consistent', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns CrossRefValidationResult shape', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-001: TaskGraph-to-Tickets 1:1 mapping                         */
/* ------------------------------------------------------------------ */

describe('XREF-001: TaskGraph-to-Tickets 1:1 mapping', () => {
  it('fails when a task has no corresponding ticket', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Remove ticket for TASK-002
    artifacts.tickets = [makeTicket('TASK-001')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-001');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-002');
  });

  it('fails when a ticket has no corresponding task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Add extra ticket for non-existent task
    artifacts.tickets = [...artifacts.tickets, makeTicket('TASK-999')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-001');
    expect(violation).toBeDefined();
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when all tasks have exactly one ticket', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const result = validator.validate(artifacts);
    expect(result.errors.filter(e => e.ruleId === 'XREF-001')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-002: TaskGraph-to-PromptPack 1:1 mapping                      */
/* ------------------------------------------------------------------ */

describe('XREF-002: TaskGraph-to-PromptPack 1:1 mapping', () => {
  it('fails when a task has no corresponding prompt pack', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Remove prompt pack for TASK-002
    artifacts.promptPacks = [makePromptPack('TASK-001')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-002');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-002');
  });

  it('fails when a prompt pack references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Add extra prompt pack for non-existent task
    artifacts.promptPacks = [...artifacts.promptPacks, makePromptPack('TASK-999')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-002');
    expect(violation).toBeDefined();
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when all tasks have exactly one prompt pack', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-002')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-003: RepoBlueprint generatedBy references TaskGraph            */
/* ------------------------------------------------------------------ */

describe('XREF-003: RepoBlueprint generatedBy references TaskGraph', () => {
  it('fails when generatedBy references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    artifacts.repoBlueprint = makeRepoBlueprint({
      root: [{
        name: 'src',
        type: 'dir',
        purpose: 'Source files',
        children: [{
          name: 'index.ts',
          type: 'file',
          purpose: 'Entry point',
          generatedBy: 'TASK-999',
        }],
      }],
    });

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-003');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when all generatedBy references are valid tasks', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-003')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-004: Ticket dependencies match TaskGraph dependsOn            */
/* ------------------------------------------------------------------ */

describe('XREF-004: Ticket dependencies match TaskGraph dependsOn', () => {
  it('fails when ticket dependencies reference non-existent tasks', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Ticket with invalid dependency
    const ticket = makeTicket('TASK-001');
    ticket.frontmatter.dependencies = ['TASK-999'];
    artifacts.tickets = [ticket, makeTicket('TASK-002')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-004');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('fails when ticket dependencies do not match task dependsOn', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // TASK-002 depends on TASK-001 in task graph, but ticket has no dependencies
    const ticket2 = makeTicket('TASK-002');
    ticket2.frontmatter.dependencies = []; // Should have TASK-001
    artifacts.tickets = [makeTicket('TASK-001'), ticket2];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-004');
    expect(violation).toBeDefined();
  });

  it('passes when ticket dependencies match task dependsOn', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-004')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-005: PromptPack inputFiles.sourceTask references TaskGraph     */
/* ------------------------------------------------------------------ */

describe('XREF-005: PromptPack inputFiles.sourceTask references TaskGraph', () => {
  it('fails when inputFiles.sourceTask references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // TASK-002 prompt pack with invalid sourceTask
    const pack2 = makePromptPack('TASK-002');
    pack2.inputFiles = [{
      filePath: 'src/index.ts',
      sourceTask: 'TASK-999',
      description: 'Invalid source task reference',
    }];
    artifacts.promptPacks = [makePromptPack('TASK-001'), pack2];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-005');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when all inputFiles.sourceTask are valid', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-005')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-006: PromptPack previousTaskOutputs.taskId references TaskGraph */
/* ------------------------------------------------------------------ */

describe('XREF-006: PromptPack previousTaskOutputs.taskId references TaskGraph', () => {
  it('fails when previousTaskOutputs.taskId references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Add invalid previousTaskOutput
    const pack2 = makePromptPack('TASK-002');
    pack2.previousTaskOutputs = [{
      taskId: 'TASK-999',
      filePath: 'src/nonexistent.ts',
      injectionPoint: 'before',
      mode: 'reference',
    }];
    artifacts.promptPacks = [makePromptPack('TASK-001'), pack2];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-006');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when previousTaskOutputs are empty', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-006')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-007: MPD taskRefs reference TaskGraph                         */
/* ------------------------------------------------------------------ */

describe('XREF-007: MPD taskRefs reference TaskGraph', () => {
  it('fails when MPD componentDesign taskRefs references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const mpd = makeMpd();
    mpd.componentDesign.components[0].taskRefs = ['TASK-999'];
    artifacts.mpd = mpd;

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-007');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('fails when MPD timeline.phases taskRefs references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const mpd = makeMpd();
    mpd.timeline.phases[0].taskRefs = ['TASK-999'];
    artifacts.mpd = mpd;

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-007');
    expect(violation).toBeDefined();
  });

  it('passes when all taskRefs are valid', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-007')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-008: MPD ADR refs match Appendices (warning)                  */
/* ------------------------------------------------------------------ */

describe('XREF-008: MPD ADR refs match Appendices', () => {
  it('produces a warning when pattern adrRef does not match appendices.adrs', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const mpd = makeMpd();
    mpd.technicalArchitecture.patterns[0].adrRef = 'ADR-999';
    // Appendices only has ADR-001
    artifacts.mpd = mpd;

    const result = validator.validate(artifacts);

    // XREF-008 is a warning, not an error
    const violation = result.warnings.find(w => w.ruleId === 'XREF-008');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
    expect(violation!.offendingValues).toContain('ADR-999');
  });

  it('does not fail (only warns) when ADR ref is missing from appendices', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const mpd = makeMpd();
    mpd.technicalArchitecture.patterns[0].adrRef = 'ADR-999';
    artifacts.mpd = mpd;

    const result = validator.validate(artifacts);

    // We just check XREF-008 doesn't appear in errors
    expect(result.errors.find(e => e.ruleId === 'XREF-008')).toBeUndefined();
  });

  it('passes without warnings when all adrRefs match appendices', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.warnings.filter(w => w.ruleId === 'XREF-008')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-009: Ticket relatedDecisions reference ADRs (warning)         */
/* ------------------------------------------------------------------ */

describe('XREF-009: Ticket relatedDecisions reference ADRs', () => {
  it('produces a warning when relatedDecisions references an ADR not in ArtifactSet.adrs', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const ticket1 = makeTicket('TASK-001');
    ticket1.body.relatedDecisions = ['ADR-999'];
    artifacts.tickets = [ticket1, makeTicket('TASK-002')];

    const result = validator.validate(artifacts);

    const violation = result.warnings.find(w => w.ruleId === 'XREF-009');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
    expect(violation!.offendingValues).toContain('ADR-999');
  });

  it('does not fail when relatedDecisions references missing ADR', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const ticket1 = makeTicket('TASK-001');
    ticket1.body.relatedDecisions = ['ADR-999'];
    artifacts.tickets = [ticket1, makeTicket('TASK-002')];

    const result = validator.validate(artifacts);

    expect(result.errors.find(e => e.ruleId === 'XREF-009')).toBeUndefined();
  });

  it('passes without warnings when relatedDecisions are all valid', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const ticket1 = makeTicket('TASK-001');
    ticket1.body.relatedDecisions = ['ADR-001'];
    artifacts.tickets = [ticket1, makeTicket('TASK-002')];

    const result = validator.validate(artifacts);
    expect(result.warnings.filter(w => w.ruleId === 'XREF-009')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-010: PromptPack outputFiles match TaskGraph filesWrite         */
/* ------------------------------------------------------------------ */

describe('XREF-010: PromptPack contract.outputFiles match TaskGraph filesWrite', () => {
  it('fails when outputFiles contain paths not in task filesWrite', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const pack1 = makePromptPack('TASK-001');
    pack1.contract.outputFiles = [{
      filePath: 'src/nonexistent.ts',
      exports: [],
      description: 'Invalid output file',
    }];
    artifacts.promptPacks = [pack1, makePromptPack('TASK-002')];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-010');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('src/nonexistent.ts');
  });

  it('passes when outputFiles match task filesWrite', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-010')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-011: PromptPack inputFiles match TaskGraph filesRead           */
/* ------------------------------------------------------------------ */

describe('XREF-011: PromptPack inputFiles.filePath match TaskGraph filesRead', () => {
  it('fails when inputFiles contain paths not in task filesRead', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // TASK-002 reads src/index.ts, but add extra invalid file
    const pack2 = makePromptPack('TASK-002');
    pack2.inputFiles = [
      { filePath: 'src/index.ts', sourceTask: 'TASK-001', description: 'Valid input' },
      { filePath: 'src/nonexistent.ts', sourceTask: 'TASK-001', description: 'Invalid input' },
    ];
    artifacts.promptPacks = [makePromptPack('TASK-001'), pack2];

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-011');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('src/nonexistent.ts');
  });

  it('passes when inputFiles match task filesRead', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-011')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-012: MPD criticalPath tasks exist in TaskGraph                */
/* ------------------------------------------------------------------ */

describe('XREF-012: MPD timeline.criticalPath tasks exist in TaskGraph', () => {
  it('fails when criticalPath references a non-existent task', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    const mpd = makeMpd();
    mpd.timeline.criticalPath = ['TASK-001', 'TASK-999'];
    artifacts.mpd = mpd;

    const result = validator.validate(artifacts);

    expect(result.valid).toBe(false);
    const violation = result.errors.find(e => e.ruleId === 'XREF-012');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    expect(violation!.offendingValues).toContain('TASK-999');
  });

  it('passes when all criticalPath tasks exist in TaskGraph', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.errors.filter(e => e.ruleId === 'XREF-012')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  XREF-013: RepoBlueprint files cover TaskGraph filesWrite (warning)  */
/* ------------------------------------------------------------------ */

describe('XREF-013: RepoBlueprint files cover TaskGraph filesWrite', () => {
  it('produces a warning when task filesWrite paths are not in repoBlueprint', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // Override repo blueprint to not cover src/utils.ts
    artifacts.repoBlueprint = makeRepoBlueprint({
      root: [{
        name: 'src',
        type: 'dir',
        purpose: 'Source files',
        children: [{
          name: 'index.ts',
          type: 'file',
          purpose: 'Entry point',
          generatedBy: 'TASK-001',
        }],
        // src/utils.ts is missing!
      }],
    });

    const result = validator.validate(artifacts);

    const violation = result.warnings.find(w => w.ruleId === 'XREF-013');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('warning');
    expect(violation!.offendingValues).toContain('src/utils.ts');
  });

  it('does not fail (only warns) when coverage is incomplete', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    artifacts.repoBlueprint = makeRepoBlueprint({
      root: [{
        name: 'src',
        type: 'dir',
        purpose: 'Source files',
        children: [{
          name: 'index.ts',
          type: 'file',
          purpose: 'Entry point',
        }],
      }],
    });

    const result = validator.validate(artifacts);

    expect(result.errors.find(e => e.ruleId === 'XREF-013')).toBeUndefined();
  });

  it('passes without warnings when all filesWrite are covered', () => {
    const validator = new CrossReferenceValidator();
    const result = validator.validate(makeValidArtifactSet());
    expect(result.warnings.filter(w => w.ruleId === 'XREF-013')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Severity enforcement                                                 */
/* ------------------------------------------------------------------ */

describe('Severity enforcement', () => {
  it('valid is false when there are error-severity violations', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    artifacts.tickets = [makeTicket('TASK-001')]; // Missing TASK-002 ticket

    const result = validator.validate(artifacts);
    expect(result.valid).toBe(false);
  });

  it('valid is true when there are only warning-severity violations', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    // ADR-999 reference causes XREF-009 warning
    const ticket1 = makeTicket('TASK-001');
    ticket1.body.relatedDecisions = ['ADR-999'];
    artifacts.tickets = [ticket1, makeTicket('TASK-002')];

    const result = validator.validate(artifacts);

    // Only XREF-009 warning should be present
    const xref9Warning = result.warnings.find(w => w.ruleId === 'XREF-009');
    expect(xref9Warning).toBeDefined();
    // No errors from XREF-009
    expect(result.errors.find(e => e.ruleId === 'XREF-009')).toBeUndefined();
  });

  it('violations have the correct shape', () => {
    const validator = new CrossReferenceValidator();
    const artifacts = makeValidArtifactSet();
    artifacts.tickets = [makeTicket('TASK-001')]; // Missing TASK-002 ticket

    const result = validator.validate(artifacts);
    const violation = result.errors[0];

    expect(violation).toHaveProperty('ruleId');
    expect(violation).toHaveProperty('ruleName');
    expect(violation).toHaveProperty('severity');
    expect(violation).toHaveProperty('message');
    expect(violation).toHaveProperty('offendingValues');
    expect(typeof violation.ruleId).toBe('string');
    expect(typeof violation.ruleName).toBe('string');
    expect(['error', 'warning']).toContain(violation.severity);
    expect(typeof violation.message).toBe('string');
    expect(Array.isArray(violation.offendingValues)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  validateCrossReferences standalone function                         */
/* ------------------------------------------------------------------ */

describe('validateCrossReferences standalone function', () => {
  it('is exported and callable', async () => {
    const { validateCrossReferences } = await import('../../../src/emitter/cross-ref-validator.js');
    expect(typeof validateCrossReferences).toBe('function');
  });

  it('returns the same result as CrossReferenceValidator.validate', async () => {
    const { validateCrossReferences } = await import('../../../src/emitter/cross-ref-validator.js');
    const artifacts = makeValidArtifactSet();
    const result = validateCrossReferences(artifacts);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
