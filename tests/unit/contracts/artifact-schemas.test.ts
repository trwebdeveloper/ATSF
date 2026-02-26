/**
 * T10: Artifact Schemas Tests
 *
 * TDD test suite for src/contracts/artifact-schemas.ts
 * Tests shared primitives and all 7 artifact schemas.
 */
import { describe, it, expect } from 'vitest';
import {
  // Shared primitives
  TaskId,
  ArtifactVersion,
  SemVer,
  ISODatetime,
  Checksum,
  AgentType,
  TaskType,
  Priority,
  TicketPriority,
  TicketType,
  TicketStatus,
  Complexity,
  SuggestedModel,
  RelativeFilePath,
  AdrRef,
  // Artifact schemas
  TaskGraphSchema,
  RepoBlueprintSchema,
  MpdSchema,
  TicketSchema,
  AiPromptPackSchema,
  AdrSchema,
  ManifestSchema,
} from '../../../src/contracts/artifact-schemas.js';

/* ------------------------------------------------------------------ */
/*  Shared Primitives                                                   */
/* ------------------------------------------------------------------ */

describe('TaskId', () => {
  it('accepts TASK-001 format', () => {
    expect(TaskId.parse('TASK-001')).toBe('TASK-001');
  });

  it('accepts TASK-999 format', () => {
    expect(TaskId.parse('TASK-999')).toBe('TASK-999');
  });

  it('accepts 4+ digit task IDs', () => {
    expect(TaskId.parse('TASK-1000')).toBe('TASK-1000');
  });

  it('rejects TASK-01 (only 2 digits)', () => {
    expect(TaskId.safeParse('TASK-01').success).toBe(false);
  });

  it('rejects lowercase task-001', () => {
    expect(TaskId.safeParse('task-001').success).toBe(false);
  });

  it('rejects TASK-ABC', () => {
    expect(TaskId.safeParse('TASK-ABC').success).toBe(false);
  });

  it('rejects missing TASK- prefix', () => {
    expect(TaskId.safeParse('001').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(TaskId.safeParse('').success).toBe(false);
  });
});

describe('ArtifactVersion', () => {
  it('accepts "1.0" format', () => {
    expect(ArtifactVersion.parse('1.0')).toBe('1.0');
  });

  it('accepts "2.3" format', () => {
    expect(ArtifactVersion.parse('2.3')).toBe('2.3');
  });

  it('rejects SemVer "1.0.0" (three parts)', () => {
    expect(ArtifactVersion.safeParse('1.0.0').success).toBe(false);
  });

  it('rejects "v1.0" with leading v', () => {
    expect(ArtifactVersion.safeParse('v1.0').success).toBe(false);
  });

  it('rejects "1" with no minor part', () => {
    expect(ArtifactVersion.safeParse('1').success).toBe(false);
  });

  it('rejects "1.0.0.0" with four parts', () => {
    expect(ArtifactVersion.safeParse('1.0.0.0').success).toBe(false);
  });
});

describe('SemVer', () => {
  it('accepts "1.0.0" format', () => {
    expect(SemVer.parse('1.0.0')).toBe('1.0.0');
  });

  it('accepts "2.13.5" format', () => {
    expect(SemVer.parse('2.13.5')).toBe('2.13.5');
  });

  it('rejects "1.0" (two parts)', () => {
    expect(SemVer.safeParse('1.0').success).toBe(false);
  });

  it('rejects "v1.0.0" with leading v', () => {
    expect(SemVer.safeParse('v1.0.0').success).toBe(false);
  });

  it('rejects "1.0.0.0" with four parts', () => {
    expect(SemVer.safeParse('1.0.0.0').success).toBe(false);
  });
});

describe('ISODatetime', () => {
  it('accepts valid ISO 8601 datetime string', () => {
    expect(ISODatetime.parse('2026-02-25T14:30:00Z')).toBe('2026-02-25T14:30:00Z');
  });

  it('rejects plain date strings', () => {
    expect(ISODatetime.safeParse('2026-02-25').success).toBe(false);
  });

  it('rejects non-datetime strings', () => {
    expect(ISODatetime.safeParse('not-a-date').success).toBe(false);
  });
});

describe('Checksum', () => {
  it('accepts valid sha256 checksum', () => {
    const checksum = 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    expect(Checksum.parse(checksum)).toBe(checksum);
  });

  it('rejects checksum without sha256: prefix', () => {
    expect(Checksum.safeParse('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2').success).toBe(false);
  });

  it('rejects checksum with wrong hash length (less than 64 hex chars)', () => {
    expect(Checksum.safeParse('sha256:abc123').success).toBe(false);
  });

  it('rejects checksum with uppercase hex chars', () => {
    const upper = 'sha256:A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2';
    expect(Checksum.safeParse(upper).success).toBe(false);
  });
});

describe('RelativeFilePath', () => {
  it('accepts relative file paths', () => {
    expect(RelativeFilePath.parse('src/index.ts')).toBe('src/index.ts');
  });

  it('accepts simple filenames', () => {
    expect(RelativeFilePath.parse('README.md')).toBe('README.md');
  });

  it('accepts nested paths', () => {
    expect(RelativeFilePath.parse('docs/api/spec.yaml')).toBe('docs/api/spec.yaml');
  });

  it('rejects absolute paths starting with /', () => {
    expect(RelativeFilePath.safeParse('/etc/passwd').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(RelativeFilePath.safeParse('').success).toBe(false);
  });
});

describe('AdrRef', () => {
  it('accepts ADR-001 format', () => {
    expect(AdrRef.parse('ADR-001')).toBe('ADR-001');
  });

  it('accepts ADR-999 format', () => {
    expect(AdrRef.parse('ADR-999')).toBe('ADR-999');
  });

  it('rejects adr-001 (lowercase)', () => {
    expect(AdrRef.safeParse('adr-001').success).toBe(false);
  });

  it('rejects ADR-01 (only 2 digits)', () => {
    expect(AdrRef.safeParse('ADR-01').success).toBe(false);
  });
});

describe('AgentType', () => {
  const validTypes = ['planner', 'architect', 'critic', 'judge', 'builder', 'reviewer', 'documenter', 'integrator'];
  for (const t of validTypes) {
    it(`accepts "${t}"`, () => {
      expect(AgentType.parse(t)).toBe(t);
    });
  }

  it('rejects unknown agent type', () => {
    expect(AgentType.safeParse('unknown').success).toBe(false);
  });
});

describe('TaskType', () => {
  const validTypes = ['feature', 'architecture', 'testing', 'documentation', 'review', 'infrastructure', 'security', 'refactoring'];
  for (const t of validTypes) {
    it(`accepts "${t}"`, () => {
      expect(TaskType.parse(t)).toBe(t);
    });
  }
});

describe('Priority', () => {
  it('accepts 1', () => expect(Priority.parse(1)).toBe(1));
  it('accepts 5', () => expect(Priority.parse(5)).toBe(5));
  it('rejects 0', () => expect(Priority.safeParse(0).success).toBe(false));
  it('rejects 6', () => expect(Priority.safeParse(6).success).toBe(false));
  it('rejects float 2.5', () => expect(Priority.safeParse(2.5).success).toBe(false));
});

describe('Complexity', () => {
  const validValues = ['trivial', 'low', 'medium', 'high', 'very_high'];
  for (const v of validValues) {
    it(`accepts "${v}"`, () => expect(Complexity.parse(v)).toBe(v));
  }
});

describe('SuggestedModel', () => {
  const validValues = ['fast', 'balanced', 'powerful'];
  for (const v of validValues) {
    it(`accepts "${v}"`, () => expect(SuggestedModel.parse(v)).toBe(v));
  }
});

describe('TicketPriority', () => {
  const validValues = ['critical', 'high', 'medium', 'low'];
  for (const v of validValues) {
    it(`accepts "${v}"`, () => expect(TicketPriority.parse(v)).toBe(v));
  }
});

describe('TicketType', () => {
  const validValues = ['feature', 'bug', 'task', 'spike', 'chore', 'architecture', 'testing', 'documentation'];
  for (const v of validValues) {
    it(`accepts "${v}"`, () => expect(TicketType.parse(v)).toBe(v));
  }
});

describe('TicketStatus', () => {
  const validValues = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
  for (const v of validValues) {
    it(`accepts "${v}"`, () => expect(TicketStatus.parse(v)).toBe(v));
  }
});

/* ------------------------------------------------------------------ */
/*  TaskGraphSchema                                                     */
/* ------------------------------------------------------------------ */

/** Minimal valid task graph object */
function validTaskGraph() {
  return {
    version: '1.0',
    generated: '2026-02-25T14:30:00Z',
    checksum: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    project: {
      name: 'TestProject',
      description: 'A valid test project with enough description text',
      constraints: [],
    },
    tasks: [
      {
        id: 'TASK-001',
        name: 'Initial task',
        description: 'This is the initial task description with enough text',
        agent: 'planner',
        type: 'feature',
        dependsOn: [],
        filesWrite: ['src/index.ts'],
        filesRead: [],
        priority: 5,
        acceptanceCriteria: [
          { description: 'The module should export a default function', testable: true },
        ],
        tags: [],
      },
    ],
  };
}

describe('TaskGraphSchema', () => {
  it('parses a minimal valid task graph', () => {
    const result = TaskGraphSchema.safeParse(validTaskGraph());
    expect(result.success).toBe(true);
  });

  it('applies default values for dependsOn, filesRead, tags', () => {
    const input = validTaskGraph();
    // Remove optional fields with defaults by explicit deletion
    const task = input.tasks[0] as Record<string, unknown>;
    delete task['dependsOn'];
    delete task['filesRead'];
    delete task['tags'];
    const result = TaskGraphSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks[0].dependsOn).toEqual([]);
      expect(result.data.tasks[0].filesRead).toEqual([]);
      expect(result.data.tasks[0].tags).toEqual([]);
    }
  });

  it('rejects version "1.0.0" (must be N.N format)', () => {
    const input = { ...validTaskGraph(), version: '1.0.0' };
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects task with description shorter than 10 chars', () => {
    const input = validTaskGraph();
    input.tasks[0].description = 'Short';
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects task with empty filesWrite array', () => {
    const input = validTaskGraph();
    input.tasks[0].filesWrite = [];
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects task with absolute path in filesWrite', () => {
    const input = validTaskGraph();
    input.tasks[0].filesWrite = ['/absolute/path.ts'];
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects task with empty acceptanceCriteria array', () => {
    const input = validTaskGraph();
    input.tasks[0].acceptanceCriteria = [];
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects dependsOn reference to non-existent task', () => {
    const input = validTaskGraph();
    input.tasks[0].dependsOn = ['TASK-999'];
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects self-referencing dependsOn', () => {
    const input = validTaskGraph();
    input.tasks[0].dependsOn = ['TASK-001'];
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('rejects duplicate task IDs', () => {
    const input = validTaskGraph();
    input.tasks.push({ ...input.tasks[0] }); // same id
    expect(TaskGraphSchema.safeParse(input).success).toBe(false);
  });

  it('detects a cycle in the task dependency graph', () => {
    const input = {
      ...validTaskGraph(),
      tasks: [
        {
          id: 'TASK-001',
          name: 'Task one here',
          description: 'Description of task one, sufficiently long',
          agent: 'planner',
          type: 'feature',
          dependsOn: ['TASK-002'],
          filesWrite: ['src/a.ts'],
          filesRead: [],
          priority: 1,
          acceptanceCriteria: [{ description: 'Criterion for task one here', testable: true }],
          tags: [],
        },
        {
          id: 'TASK-002',
          name: 'Task two here',
          description: 'Description of task two, sufficiently long',
          agent: 'builder',
          type: 'feature',
          dependsOn: ['TASK-001'],
          filesWrite: ['src/b.ts'],
          filesRead: [],
          priority: 1,
          acceptanceCriteria: [{ description: 'Criterion for task two here', testable: true }],
          tags: [],
        },
      ],
    };
    const result = TaskGraphSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.toLowerCase().includes('cycle'))).toBe(true);
    }
  });

  it('parses a 12-task graph without cycles (the TaskFlow example)', () => {
    // A linearized subset of the 12-task TaskFlow example
    // (full YAML loaded separately in fixture tests)
    const tasks = Array.from({ length: 12 }, (_, i) => {
      const num = String(i + 1).padStart(3, '0');
      const dep = i === 0 ? [] : [`TASK-${String(i).padStart(3, '0')}`];
      return {
        id: `TASK-${num}`,
        name: `Task ${num} with enough name chars`,
        description: `Description for task ${num} that has enough text to pass validation`,
        agent: 'builder' as const,
        type: 'feature' as const,
        dependsOn: dep,
        filesWrite: [`src/task${num}.ts`],
        filesRead: [] as string[],
        priority: 3 as const,
        acceptanceCriteria: [{ description: `Acceptance criterion for task ${num} long enough`, testable: true }],
        tags: [] as string[],
      };
    });
    const input = { ...validTaskGraph(), tasks };
    expect(TaskGraphSchema.safeParse(input).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  RepoBlueprintSchema                                                 */
/* ------------------------------------------------------------------ */

function validRepoBlueprint() {
  return {
    version: '1.0',
    generated: '2026-02-25T14:30:00Z',
    checksum: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    projectName: 'TestProject',
    root: [
      {
        name: 'src',
        type: 'dir' as const,
        purpose: 'Source code directory',
        children: [
          {
            name: 'index.ts',
            type: 'file' as const,
            purpose: 'Entry point',
            language: 'TypeScript',
          },
        ],
      },
    ],
  };
}

describe('RepoBlueprintSchema', () => {
  it('parses a valid repo blueprint', () => {
    expect(RepoBlueprintSchema.safeParse(validRepoBlueprint()).success).toBe(true);
  });

  it('accepts deeply nested directory structures', () => {
    const input = validRepoBlueprint();
    input.root[0].children = [
      {
        name: 'sub',
        type: 'dir' as const,
        purpose: 'Sub directory',
        children: [
          {
            name: 'file.ts',
            type: 'file' as const,
            purpose: 'A nested file',
          },
        ],
      },
    ];
    expect(RepoBlueprintSchema.safeParse(input).success).toBe(true);
  });

  it('rejects file nodes that have children', () => {
    const input = validRepoBlueprint();
    input.root[0].children = [
      {
        name: 'index.ts',
        type: 'file' as const,
        purpose: 'Entry point',
        children: [{ name: 'illegal', type: 'file' as const, purpose: 'Illegal child' }],
      } as Parameters<typeof RepoBlueprintSchema.safeParse>[0]['root'][0],
    ];
    expect(RepoBlueprintSchema.safeParse(input).success).toBe(false);
  });

  it('rejects directory nodes that have language field', () => {
    const input = validRepoBlueprint();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.root[0] as any).language = 'TypeScript';
    expect(RepoBlueprintSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty root array', () => {
    const input = { ...validRepoBlueprint(), root: [] };
    expect(RepoBlueprintSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid ArtifactVersion format', () => {
    const input = { ...validRepoBlueprint(), version: '1.0.0' };
    expect(RepoBlueprintSchema.safeParse(input).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  MpdSchema                                                           */
/* ------------------------------------------------------------------ */

function validMpd() {
  const taskId = 'TASK-001';
  return {
    version: '1.0',
    generated: '2026-02-25T14:30:00Z',
    checksum: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    executiveSummary: {
      projectName: 'TestProject',
      oneLiner: 'A simple test project for validating schema behavior',
      objectives: ['Implement data model', 'Expose REST API'],
      targetAudience: ['Developers', 'End users'],
      scope: {
        inScope: ['Core CRUD operations with authentication support'],
        outOfScope: ['GraphQL interface is out of scope for MVP'],
      },
    },
    projectOverview: {
      background: 'The system addresses the need for a reliable task management tool that scales.',
      problemStatement: 'Teams lack a centralized way to track and coordinate project tasks effectively.',
      proposedSolution: 'Build a REST API backed by PostgreSQL with role-based access control features.',
      successCriteria: ['99.9% uptime', 'Sub-100ms P50 response time'],
      assumptions: [],
    },
    technicalArchitecture: {
      overview: 'The system uses a layered architecture with clear separation of concerns throughout.',
      diagrams: [
        {
          type: 'flowchart' as const,
          title: 'System Architecture',
          source: 'flowchart TD\n  A[Client] --> B[API Gateway]',
        },
      ],
      patterns: [
        {
          name: 'Repository Pattern',
          rationale: 'Separates data access logic from business logic for testability',
        },
      ],
      techStack: [
        {
          name: 'Node.js',
          version: '20.x',
          purpose: 'Runtime environment',
          category: 'language' as const,
        },
      ],
    },
    componentDesign: {
      components: [
        {
          name: 'AuthService',
          description: 'Handles authentication and authorization for all requests',
          responsibilities: ['Validate JWT tokens', 'Enforce RBAC policies'],
          interfaces: [],
          dependencies: [],
          taskRefs: [taskId],
        },
      ],
    },
    dataModel: {
      overview: 'All data stored in PostgreSQL with normalized schema design.',
      entities: [],
    },
    apiDesign: {
      overview: 'REST API following JSON:API conventions with standard HTTP methods.',
      endpoints: [],
    },
    securityConsiderations: {
      overview: 'Security follows OWASP Top 10 guidelines with JWT-based authentication.',
      threatModel: [],
    },
    testingStrategy: {
      overview: 'Testing follows the pyramid with unit tests at the base layer.',
      levels: [
        {
          name: 'unit' as const,
          description: 'Unit tests for all service methods and utility functions',
          tools: ['vitest'],
          coverageTarget: '80%',
        },
      ],
      taskRefs: [],
    },
    deploymentPlan: {
      overview: 'Deployed to AWS using containerized workloads with auto-scaling groups.',
      environments: [
        {
          name: 'production',
          purpose: 'Production environment serving end users',
        },
      ],
    },
    riskAssessment: {
      risks: [
        {
          id: 'RISK-001',
          description: 'Database migration complexity could delay the project timeline',
          probability: 'medium' as const,
          impact: 'major' as const,
          mitigation: 'Use versioned migration scripts with rollback support',
        },
      ],
    },
    timeline: {
      phases: [
        {
          name: 'Phase 1',
          description: 'Core implementation phase one',
          taskRefs: [taskId],
        },
      ],
      criticalPath: [taskId],
    },
    glossary: {
      terms: [],
    },
    appendices: {
      adrs: [],
      references: [],
    },
  };
}

describe('MpdSchema', () => {
  it('parses a valid MPD', () => {
    const result = MpdSchema.safeParse(validMpd());
    expect(result.success).toBe(true);
  });

  it('rejects MPD with missing executiveSummary', () => {
    const input = validMpd();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input as any).executiveSummary;
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty objectives array in executiveSummary', () => {
    const input = validMpd();
    input.executiveSummary.objectives = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty diagrams array in technicalArchitecture', () => {
    const input = validMpd();
    input.technicalArchitecture.diagrams = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty components array in componentDesign', () => {
    const input = validMpd();
    input.componentDesign.components = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid RISK-NNN id pattern', () => {
    const input = validMpd();
    input.riskAssessment.risks[0].id = 'RISK-01'; // only 2 digits
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty testing levels array', () => {
    const input = validMpd();
    input.testingStrategy.levels = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty environments array in deploymentPlan', () => {
    const input = validMpd();
    input.deploymentPlan.environments = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty risks array in riskAssessment', () => {
    const input = validMpd();
    input.riskAssessment.risks = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty phases in timeline', () => {
    const input = validMpd();
    input.timeline.phases = [];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid ASMP-NNN id pattern', () => {
    const input = validMpd();
    input.projectOverview.assumptions = [
      { id: 'ASMP-01', description: 'This is a valid assumption description text', source: 'user' as const },
    ];
    expect(MpdSchema.safeParse(input).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  TicketSchema                                                        */
/* ------------------------------------------------------------------ */

function validTicket() {
  return {
    frontmatter: {
      id: 'TASK-001',
      title: 'Design database schema and entity relationships',
      type: 'architecture' as const,
      priority: 'critical' as const,
      estimate: '3h',
      dependencies: [],
      labels: ['database', 'architecture'],
      assignee: 'planner',
      status: 'backlog' as const,
    },
    body: {
      description: 'Design the complete PostgreSQL database schema for the TaskFlow application. This is the foundational task.',
      acceptanceCriteria: [
        {
          given: 'The requirements document is available',
          when: 'The database schema is designed',
          then: 'All four entities are defined with complete column specifications',
        },
      ],
      technicalNotes: 'Use PostgreSQL 16.x features for optimal performance and reliability.',
      relatedDecisions: [],
    },
  };
}

describe('TicketSchema', () => {
  it('parses a valid ticket', () => {
    expect(TicketSchema.safeParse(validTicket()).success).toBe(true);
  });

  it('applies default values for status, assignee, labels, dependencies', () => {
    const input = validTicket();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input.frontmatter as any).status;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (input.frontmatter as any).assignee;
    const result = TicketSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frontmatter.status).toBe('backlog');
      expect(result.data.frontmatter.assignee).toBe('unassigned');
    }
  });

  it('rejects invalid estimate format (no unit)', () => {
    const input = validTicket();
    input.frontmatter.estimate = '3'; // missing h/d/w suffix
    expect(TicketSchema.safeParse(input).success).toBe(false);
  });

  it('accepts estimate "4h"', () => {
    const input = validTicket();
    input.frontmatter.estimate = '4h';
    expect(TicketSchema.safeParse(input).success).toBe(true);
  });

  it('accepts estimate "2d"', () => {
    const input = validTicket();
    input.frontmatter.estimate = '2d';
    expect(TicketSchema.safeParse(input).success).toBe(true);
  });

  it('accepts estimate "1w"', () => {
    const input = validTicket();
    input.frontmatter.estimate = '1w';
    expect(TicketSchema.safeParse(input).success).toBe(true);
  });

  it('rejects empty acceptanceCriteria array', () => {
    const input = validTicket();
    input.body.acceptanceCriteria = [];
    expect(TicketSchema.safeParse(input).success).toBe(false);
  });

  it('rejects description shorter than 20 chars', () => {
    const input = validTicket();
    input.body.description = 'Short desc'; // 10 chars, under the 20 minimum
    expect(TicketSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid TaskId in frontmatter id', () => {
    const input = validTicket();
    input.frontmatter.id = 'TASK-01'; // only 2 digits
    expect(TicketSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid AdrRef in relatedDecisions', () => {
    const input = validTicket();
    input.body.relatedDecisions = ['ADR-01']; // only 2 digits
    expect(TicketSchema.safeParse(input).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  AiPromptPackSchema                                                  */
/* ------------------------------------------------------------------ */

function validPromptPack() {
  return {
    taskId: 'TASK-003',
    taskName: 'Design JWT authentication and RBAC strategy',
    context: 'You are designing the authentication and authorization strategy for TaskFlow, a task management SaaS API.',
    contract: {
      outputFiles: [
        {
          filePath: 'docs/auth-strategy.md',
          exports: [],
          description: 'JWT signing config and token lifecycle document',
        },
      ],
      exports: [],
      dependencies: [
        { name: 'jsonwebtoken', version: '^9.0', purpose: 'JWT signing and verification' },
      ],
    },
    inputFiles: [
      {
        filePath: 'docs/database-schema.yaml',
        sourceTask: 'TASK-001',
        description: 'Database schema from task one',
      },
    ],
    instructions: [
      { step: 1, instruction: 'Design JWT token structure with HS256, configurable secret and expiry' },
      { step: 2, instruction: 'Design refresh token rotation with theft detection mechanism' },
    ],
    constraints: [
      'Do not use RS256 or asymmetric algorithms in any case',
      'Do not store refresh tokens only in memory storage',
    ],
    testCriteria: [
      'Auth strategy covers all five required sections thoroughly',
      'JWT payload contains only sub, role, iat, exp fields',
    ],
    estimatedComplexity: 'high' as const,
    suggestedModel: 'powerful' as const,
    previousTaskOutputs: [
      {
        taskId: 'TASK-001',
        filePath: 'docs/database-schema.yaml',
        injectionPoint: 'context',
        mode: 'summary' as const,
      },
    ],
  };
}

describe('AiPromptPackSchema', () => {
  it('parses a valid prompt pack', () => {
    expect(AiPromptPackSchema.safeParse(validPromptPack()).success).toBe(true);
  });

  it('rejects non-sequential instruction steps', () => {
    const input = validPromptPack();
    input.instructions = [
      { step: 1, instruction: 'First instruction step is detailed and long enough to pass' },
      { step: 3, instruction: 'Third instruction skips step two in the sequence' }, // skips 2
    ];
    const result = AiPromptPackSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.toLowerCase().includes('sequential'))).toBe(true);
    }
  });

  it('rejects self-referencing input files', () => {
    const input = validPromptPack();
    input.inputFiles = [
      {
        filePath: 'docs/output.md',
        sourceTask: 'TASK-003', // same as taskId
        description: 'Self-referencing file description',
      },
    ];
    const result = AiPromptPackSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects self-referencing previousTaskOutputs', () => {
    const input = validPromptPack();
    input.previousTaskOutputs = [
      {
        taskId: 'TASK-003', // same as taskId
        filePath: 'docs/output.md',
        injectionPoint: 'context',
        mode: 'full' as const,
      },
    ];
    const result = AiPromptPackSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty instructions array', () => {
    const input = validPromptPack();
    input.instructions = [];
    expect(AiPromptPackSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty constraints array', () => {
    const input = validPromptPack();
    input.constraints = [];
    expect(AiPromptPackSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty testCriteria array', () => {
    const input = validPromptPack();
    input.testCriteria = [];
    expect(AiPromptPackSchema.safeParse(input).success).toBe(false);
  });

  it('rejects absolute filePath in outputFiles', () => {
    const input = validPromptPack();
    input.contract.outputFiles[0].filePath = '/absolute/path.md';
    expect(AiPromptPackSchema.safeParse(input).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  AdrSchema (MADR v4.0)                                              */
/* ------------------------------------------------------------------ */

function validAdr() {
  return {
    id: 'ADR-001',
    status: 'accepted' as const,
    date: '2026-02-25',
    title: 'Use Kysely as the SQL query builder for data access',
    context: 'The team needs to decide on a data access pattern. We considered ORM, query builder, and raw SQL approaches.',
    options: [
      {
        name: 'Kysely',
        description: 'Type-safe SQL query builder',
        pros: ['Type safety', 'No magic'],
        neutral: [],
        cons: ['Verbose for complex queries'],
      },
      {
        name: 'Prisma ORM',
        description: 'Full-featured ORM with schema-first approach',
        pros: ['Auto-migrations', 'Studio GUI'],
        neutral: ['Opinionated schema format'],
        cons: ['Large bundle', 'Magic behavior'],
      },
    ],
    chosenOption: 'Kysely',
    rationale: 'Kysely provides type safety without ORM magic, which matches our constraint of no-ORM.',
    relatedTasks: [],
  };
}

describe('AdrSchema (MADR v4.0)', () => {
  it('parses a valid ADR', () => {
    expect(AdrSchema.safeParse(validAdr()).success).toBe(true);
  });

  it('rejects chosenOption that is not in options list', () => {
    const input = validAdr();
    input.chosenOption = 'Drizzle'; // not in options list
    const result = AdrSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs.some((m) => m.includes('Drizzle'))).toBe(true);
    }
  });

  it('rejects options array with fewer than 2 options', () => {
    const input = validAdr();
    input.options = [input.options[0]];
    expect(AdrSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid ADR id format', () => {
    const input = validAdr();
    input.id = 'ADR-01'; // only 2 digits
    expect(AdrSchema.safeParse(input).success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const input = validAdr();
    input.date = '2026/02/25'; // wrong separator
    expect(AdrSchema.safeParse(input).success).toBe(false);
  });

  it('rejects short context (less than 20 chars)', () => {
    const input = validAdr();
    input.context = 'Too short context';
    expect(AdrSchema.safeParse(input).success).toBe(false);
  });

  it('accepts optional fields: decisionMakers, consulted, informed, consequences', () => {
    const input = {
      ...validAdr(),
      decisionMakers: 'Tech Lead, Architect',
      consulted: 'Senior Developer',
      informed: 'Team Members',
      consequences: [
        { type: 'good' as const, description: 'Improved type safety across the data layer' },
        { type: 'bad' as const, description: 'More verbose query construction required' },
      ],
      consensusScore: 0.85,
      confidenceScore: 0.9,
      debateRef: 'DEBATE-001',
    };
    expect(AdrSchema.safeParse(input).success).toBe(true);
  });

  it('rejects consensusScore outside 0-1 range', () => {
    const input = { ...validAdr(), consensusScore: 1.5 };
    expect(AdrSchema.safeParse(input).success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  ManifestSchema                                                      */
/* ------------------------------------------------------------------ */

function validManifest() {
  return {
    version: '1.0',
    generated: '2026-02-25T14:30:00Z',
    atsfVersion: '1.0.0',
    projectName: 'TestProject',
    files: [
      {
        path: 'task_graph.yaml',
        checksum: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        sizeBytes: 4096,
        artifactType: 'task_graph' as const,
      },
    ],
    totalTasks: 12,
    totalCostUsd: 0.42,
    durationMs: 8500,
  };
}

describe('ManifestSchema', () => {
  it('parses a valid manifest', () => {
    expect(ManifestSchema.safeParse(validManifest()).success).toBe(true);
  });

  it('requires atsfVersion in SemVer format (N.N.N)', () => {
    const input = { ...validManifest(), atsfVersion: '1.0' }; // only N.N
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('requires version in ArtifactVersion format (N.N)', () => {
    const input = { ...validManifest(), version: '1.0.0' }; // SemVer not allowed here
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects empty files array', () => {
    const input = { ...validManifest(), files: [] };
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects negative sizeBytes', () => {
    const input = validManifest();
    input.files[0].sizeBytes = -1;
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects absolute path in files', () => {
    const input = validManifest();
    input.files[0].path = '/absolute/task_graph.yaml';
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects negative totalTasks', () => {
    const input = { ...validManifest(), totalTasks: 0 };
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects negative totalCostUsd', () => {
    const input = { ...validManifest(), totalCostUsd: -1 };
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects negative durationMs', () => {
    const input = { ...validManifest(), durationMs: -1 };
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unknown artifactType', () => {
    const input = validManifest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.files[0] as any).artifactType = 'unknown_type';
    expect(ManifestSchema.safeParse(input).success).toBe(false);
  });

  it('accepts all valid artifactType values', () => {
    const types = ['task_graph', 'repo_blueprint', 'mpd', 'tickets', 'ai_prompt_pack', 'manifest'] as const;
    for (const artifactType of types) {
      const input = { ...validManifest(), files: [{ ...validManifest().files[0], artifactType }] };
      expect(ManifestSchema.safeParse(input).success).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  TypeScript type exports                                             */
/* ------------------------------------------------------------------ */

describe('TypeScript type exports', () => {
  it('exports inferred types via z.infer', async () => {
    // This is a compile-time check -- if the import works, types are exported.
    const mod = await import('../../../src/contracts/artifact-schemas.js');
    // Check schema objects are exported
    expect(mod.TaskGraphSchema).toBeDefined();
    expect(mod.RepoBlueprintSchema).toBeDefined();
    expect(mod.MpdSchema).toBeDefined();
    expect(mod.TicketSchema).toBeDefined();
    expect(mod.AiPromptPackSchema).toBeDefined();
    expect(mod.AdrSchema).toBeDefined();
    expect(mod.ManifestSchema).toBeDefined();
    // Check primitives are exported
    expect(mod.TaskId).toBeDefined();
    expect(mod.ArtifactVersion).toBeDefined();
    expect(mod.SemVer).toBeDefined();
    expect(mod.RelativeFilePath).toBeDefined();
  });
});
