/**
 * Artifact Schemas — T10
 *
 * Defines all 7 artifact schema contracts + shared primitives per Section 10.7.
 * These schemas validate ATSF output artifacts:
 *   task_graph.yaml, repo_blueprint.yaml, MPD.md, tickets/, ai_prompt_pack/, ADRs, manifest.json
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  10.7.1 Shared Primitives                                           */
/* ------------------------------------------------------------------ */

/** Task ID format: TASK-NNN (zero-padded, 3+ digits) */
export const TaskId = z.string().regex(/^TASK-\d{3,}$/, {
  error: 'Task ID must match pattern TASK-NNN (e.g., TASK-001)',
});

/** Artifact format version (MAJOR.MINOR). Used for task_graph, repo_blueprint, mpd schemas. */
export const ArtifactVersion = z.string().regex(/^\d+\.\d+$/, {
  error: 'Artifact version must be in format N.N (e.g., 1.0)',
});

/** Full semantic version string (MAJOR.MINOR.PATCH). Used for atsfVersion in manifest. */
export const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/, {
  error: 'Version must be in SemVer format N.N.N (e.g., 1.0.0)',
});

/** ISO 8601 datetime string */
export const ISODatetime = z.string().datetime();

/** SHA-256 checksum with prefix */
export const Checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/, {
  error: 'Checksum must be sha256:<64 hex chars>',
});

/** Agent type enum -- the 8 MVP agent roles */
export const AgentType = z.enum([
  'planner', 'architect', 'critic', 'judge',
  'builder', 'reviewer', 'documenter', 'integrator',
]);

/** Task type enum */
export const TaskType = z.enum([
  'feature', 'architecture', 'testing', 'documentation',
  'review', 'infrastructure', 'security', 'refactoring',
]);

/** Priority levels (1 = lowest, 5 = highest) */
export const Priority = z.number().int().min(1).max(5);

/** Ticket priority as enum string */
export const TicketPriority = z.enum(['critical', 'high', 'medium', 'low']);

/** Ticket type enum */
export const TicketType = z.enum([
  'feature', 'bug', 'task', 'spike', 'chore',
  'architecture', 'testing', 'documentation',
]);

/** Ticket status enum */
export const TicketStatus = z.enum([
  'backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled',
]);

/** Complexity estimate for AI prompt packs */
export const Complexity = z.enum(['trivial', 'low', 'medium', 'high', 'very_high']);

/** Suggested model tier for AI prompt packs */
export const SuggestedModel = z.enum(['fast', 'balanced', 'powerful']);

/** File path (relative to project root, no leading slash) */
export const RelativeFilePath = z.string().min(1).regex(/^[^/]/, {
  error: 'File path must be relative (no leading slash)',
});

/** ADR reference pattern: ADR-NNN */
export const AdrRef = z.string().regex(/^ADR-\d{3,}$/, {
  error: 'ADR reference must match pattern ADR-NNN',
});

/* ------------------------------------------------------------------ */
/*  10.7.2 TaskGraphSchema                                             */
/* ------------------------------------------------------------------ */

const AcceptanceCriterion = z.object({
  description: z.string().min(10),
  testable: z.boolean().default(true),
});

/**
 * TaskNodeArtifact: the serialized task definition in task_graph.yaml.
 * Distinct from `TaskNode` in Section 5.2 (the in-memory DAG node interface)
 * and from `RawTaskDefinition` (the builder input). This schema is richer,
 * including description, type, acceptanceCriteria, and tags for artifact output.
 */
const TaskNodeArtifact = z.object({
  id: TaskId,
  name: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  agent: AgentType,
  type: TaskType,
  dependsOn: z.array(TaskId).default([]),
  filesWrite: z.array(RelativeFilePath).min(1),
  filesRead: z.array(RelativeFilePath).default([]),
  priority: Priority,
  estimatedTokens: z.number().int().min(100).max(500000).optional(),
  category: z.string().min(1).max(60).optional(),
  acceptanceCriteria: z.array(AcceptanceCriterion).min(1),
  tags: z.array(z.string().min(1).max(30)).default([]),
});

const ProjectMeta = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  techStack: z.array(z.object({
    name: z.string().min(1),
    version: z.string().optional(),
    purpose: z.string().min(1),
  })).min(1).optional(),
  constraints: z.array(z.string().min(5)).default([]),
});

export const TaskGraphSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  project: ProjectMeta,
  tasks: z.array(TaskNodeArtifact).min(1),
}).superRefine((data, ctx) => {
  const taskIds = new Set(data.tasks.map(t => t.id));

  // Validate dependsOn references and self-references
  for (const task of data.tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        ctx.addIssue({
          code: 'custom', path: ['tasks'],
          message: `Task ${task.id} depends on non-existent task ${dep}`,
        });
      }
    }
    if (task.dependsOn.includes(task.id)) {
      ctx.addIssue({
        code: 'custom', path: ['tasks'],
        message: `Task ${task.id} cannot depend on itself`,
      });
    }
  }

  // Validate no duplicate task IDs
  if (taskIds.size !== data.tasks.length) {
    ctx.addIssue({
      code: 'custom', path: ['tasks'],
      message: 'Duplicate task IDs detected',
    });
  }

  // DAG cycle detection via DFS 3-color marking
  // NOTE: This is a lightweight detection-only check for Zod schema validation (L2).
  // It does NOT reconstruct the cycle path -- it just rejects the artifact.
  // The full cycle path reconstruction (for ValidationError.cyclePath in Section 5.2.2)
  // is implemented in src/dag/static/validator.ts, which maintains a path stack
  // during DFS traversal. The validator provides detailed error messages;
  // the schema provides early rejection.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const t of data.tasks) color.set(t.id, WHITE);
  const adj = new Map<string, string[]>();
  for (const t of data.tasks) adj.set(t.id, t.dependsOn.filter(d => taskIds.has(d)));

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) return true;
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const t of data.tasks) {
    if (color.get(t.id) === WHITE && dfs(t.id)) {
      ctx.addIssue({
        code: 'custom', path: ['tasks'],
        message: 'Cycle detected in task dependency graph',
      });
      break;
    }
  }
});

export type TaskGraphArtifact = z.infer<typeof TaskGraphSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.3 RepoBlueprintSchema                                         */
/* ------------------------------------------------------------------ */

interface RepoBlueprintNode {
  name: string;
  type: 'dir' | 'file';
  purpose: string;
  generatedBy?: string;
  language?: string;
  dependencies?: string[];
  children?: RepoBlueprintNode[];
}

const RepoBlueprintNode: z.ZodType<RepoBlueprintNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['dir', 'file']),
    purpose: z.string().min(1).max(500),
    generatedBy: TaskId.optional(),
    language: z.string().min(1).max(30).optional(),
    dependencies: z.array(z.string().min(1)).optional(),
    children: z.array(RepoBlueprintNode).optional(),
  }).superRefine((node, ctx) => {
    if (node.type === 'file' && node.children && node.children.length > 0) {
      ctx.addIssue({
        code: 'custom', path: ['children'],
        message: `File node "${node.name}" cannot have children`,
      });
    }
    if (node.type === 'dir' && node.language) {
      ctx.addIssue({
        code: 'custom', path: ['language'],
        message: `Directory node "${node.name}" should not have a language field`,
      });
    }
  })
);

export const RepoBlueprintSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  projectName: z.string().min(1).max(200),
  root: z.array(RepoBlueprintNode).min(1),
});

export type RepoBlueprint = z.infer<typeof RepoBlueprintSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.4 MpdSchema (Structured)                                      */
/* ------------------------------------------------------------------ */

const MermaidDiagram = z.object({
  type: z.enum([
    'flowchart', 'sequenceDiagram', 'erDiagram',
    'classDiagram', 'stateDiagram', 'gantt', 'graph',
  ]),
  title: z.string().min(1).max(200),
  source: z.string().min(10),
});

export const MpdSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  checksum: Checksum,
  executiveSummary: z.object({
    projectName: z.string().min(1),
    oneLiner: z.string().min(10).max(300),
    objectives: z.array(z.string().min(5)).min(1),
    targetAudience: z.array(z.string().min(1)).min(1),
    scope: z.object({
      inScope: z.array(z.string().min(5)).min(1),
      outOfScope: z.array(z.string().min(5)).min(1),
    }),
  }),
  projectOverview: z.object({
    background: z.string().min(20),
    problemStatement: z.string().min(20),
    proposedSolution: z.string().min(20),
    successCriteria: z.array(z.string().min(5)).min(1),
    assumptions: z.array(z.object({
      id: z.string().regex(/^ASMP-\d{3}$/),
      description: z.string().min(10),
      source: z.enum(['user', 'inferred', 'domain']),
    })).default([]),
  }),
  technicalArchitecture: z.object({
    overview: z.string().min(20),
    diagrams: z.array(MermaidDiagram).min(1),
    patterns: z.array(z.object({
      name: z.string().min(1),
      rationale: z.string().min(10),
      adrRef: AdrRef.optional(),
    })).min(1),
    techStack: z.array(z.object({
      name: z.string().min(1),
      version: z.string().optional(),
      purpose: z.string().min(1),
      category: z.enum([
        'language', 'framework', 'database',
        'infrastructure', 'tooling', 'library',
      ]),
    })).min(1),
  }),
  componentDesign: z.object({
    components: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(10),
      responsibilities: z.array(z.string().min(5)).min(1),
      interfaces: z.array(z.string()).default([]),
      dependencies: z.array(z.string()).default([]),
      taskRefs: z.array(TaskId).min(1),
    })).min(1),
    diagrams: z.array(MermaidDiagram).optional(),
  }),
  dataModel: z.object({
    overview: z.string().min(10),
    entities: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(10),
      fields: z.array(z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        constraints: z.string().optional(),
        description: z.string().optional(),
      })).min(1),
      relationships: z.array(z.string()).default([]),
    })).default([]),
    diagrams: z.array(MermaidDiagram).optional(),
  }),
  apiDesign: z.object({
    overview: z.string().min(10),
    endpoints: z.array(z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().min(1),
      description: z.string().min(5),
      taskRef: TaskId.optional(),
    })).default([]),
    authStrategy: z.string().optional(),
  }),
  securityConsiderations: z.object({
    overview: z.string().min(10),
    threatModel: z.array(z.object({
      threat: z.string().min(5),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      mitigation: z.string().min(5),
      taskRef: TaskId.optional(),
    })).default([]),
  }),
  testingStrategy: z.object({
    overview: z.string().min(10),
    levels: z.array(z.object({
      name: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']),
      description: z.string().min(10),
      tools: z.array(z.string().min(1)).min(1),
      coverageTarget: z.string().optional(),
    })).min(1),
    taskRefs: z.array(TaskId).default([]),
  }),
  deploymentPlan: z.object({
    overview: z.string().min(10),
    environments: z.array(z.object({
      name: z.string().min(1),
      purpose: z.string().min(5),
      infrastructure: z.string().optional(),
    })).min(1),
    cicdPipeline: z.string().optional(),
  }),
  riskAssessment: z.object({
    risks: z.array(z.object({
      id: z.string().regex(/^RISK-\d{3}$/),
      description: z.string().min(10),
      probability: z.enum(['high', 'medium', 'low']),
      impact: z.enum(['critical', 'major', 'minor']),
      mitigation: z.string().min(5),
    })).min(1),
  }),
  timeline: z.object({
    phases: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(5),
      taskRefs: z.array(TaskId).min(1),
    })).min(1),
    criticalPath: z.array(TaskId).min(1),
    diagram: MermaidDiagram.optional(),
  }),
  glossary: z.object({
    terms: z.array(z.object({
      term: z.string().min(1),
      definition: z.string().min(5),
    })).default([]),
  }),
  appendices: z.object({
    adrs: z.array(z.object({
      id: AdrRef,
      title: z.string().min(1),
      status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
      summary: z.string().min(10),
    })).default([]),
    references: z.array(z.object({
      title: z.string().min(1),
      url: z.string().url().optional(),
      description: z.string().optional(),
    })).default([]),
  }),
});

export type Mpd = z.infer<typeof MpdSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.5 TicketSchema                                                */
/* ------------------------------------------------------------------ */

const GivenWhenThen = z.object({
  given: z.string().min(5),
  when: z.string().min(5),
  then: z.string().min(5),
});

const TicketFrontmatter = z.object({
  id: TaskId,
  title: z.string().min(3).max(200),
  type: TicketType,
  priority: TicketPriority,
  estimate: z.string().regex(/^\d+[hdw]$/, {
    error: 'Estimate must match format: <number><h|d|w> (e.g., 4h, 2d, 1w)',
  }),
  dependencies: z.array(TaskId).default([]),
  labels: z.array(z.string().min(1).max(30)).default([]),
  assignee: z.string().min(1).default('unassigned'),
  status: TicketStatus.default('backlog'),
});

export const TicketSchema = z.object({
  frontmatter: TicketFrontmatter,
  body: z.object({
    description: z.string().min(20),
    acceptanceCriteria: z.array(GivenWhenThen).min(1),
    technicalNotes: z.string().min(10).optional(),
    relatedDecisions: z.array(AdrRef).default([]),
  }),
});

export type Ticket = z.infer<typeof TicketSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.6 AiPromptPackSchema                                          */
/* ------------------------------------------------------------------ */

const OutputFileContract = z.object({
  filePath: RelativeFilePath,
  exports: z.array(z.string().min(1)).default([]),
  description: z.string().min(5),
});

const InputFile = z.object({
  filePath: RelativeFilePath,
  sourceTask: TaskId,
  description: z.string().min(5).optional(),
});

const InstructionStep = z.object({
  step: z.number().int().min(1),
  instruction: z.string().min(10),
});

const PreviousTaskOutput = z.object({
  taskId: TaskId,
  filePath: RelativeFilePath,
  injectionPoint: z.string().min(1),
  mode: z.enum(['full', 'summary', 'reference']).default('reference'),
});

export const AiPromptPackSchema = z.object({
  taskId: TaskId,
  taskName: z.string().min(3).max(120),
  context: z.string().min(20),
  contract: z.object({
    outputFiles: z.array(OutputFileContract).min(1),
    exports: z.array(z.string()).default([]),
    dependencies: z.array(z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      purpose: z.string().min(1).optional(),
    })).default([]),
  }),
  inputFiles: z.array(InputFile).default([]),
  instructions: z.array(InstructionStep).min(1),
  constraints: z.array(z.string().min(5)).min(1),
  testCriteria: z.array(z.string().min(5)).min(1),
  estimatedComplexity: Complexity,
  suggestedModel: SuggestedModel,
  previousTaskOutputs: z.array(PreviousTaskOutput).default([]),
}).superRefine((data, ctx) => {
  // No self-referencing input files
  for (const input of data.inputFiles) {
    if (input.sourceTask === data.taskId) {
      ctx.addIssue({
        code: 'custom', path: ['inputFiles'],
        message: `Input file "${input.filePath}" cannot reference its own task ${data.taskId}`,
      });
    }
  }
  // No self-referencing previous outputs
  for (const prev of data.previousTaskOutputs) {
    if (prev.taskId === data.taskId) {
      ctx.addIssue({
        code: 'custom', path: ['previousTaskOutputs'],
        message: `Previous task output cannot reference own task ${data.taskId}`,
      });
    }
  }
  // Sequential instruction steps
  for (let i = 0; i < data.instructions.length; i++) {
    if (data.instructions[i].step !== i + 1) {
      ctx.addIssue({
        code: 'custom', path: ['instructions'],
        message: `Instruction step ${i + 1} has step number ${data.instructions[i].step} (must be sequential)`,
      });
      break;
    }
  }
});

export type AiPromptPack = z.infer<typeof AiPromptPackSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.7 AdrSchema (MADR v4.0)                                       */
/* ------------------------------------------------------------------ */

export const AdrSchema = z.object({
  id: AdrRef,
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  decisionMakers: z.string().optional(),
  consulted: z.string().optional(),
  informed: z.string().optional(),
  title: z.string().min(5),
  context: z.string().min(20),
  decisionDrivers: z.array(z.string().min(5)).optional(),
  options: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    pros: z.array(z.string().min(1)).default([]),
    neutral: z.array(z.string().min(1)).default([]),
    cons: z.array(z.string().min(1)).default([]),
  })).min(2),
  chosenOption: z.string().min(1),
  rationale: z.string().min(10),
  consequences: z.array(z.object({
    type: z.enum(['good', 'bad']),
    description: z.string().min(5),
  })).optional(),
  confirmation: z.string().optional(),
  moreInformation: z.string().optional(),
  // ATSF extensions
  debateRef: z.string().optional(),
  consensusScore: z.number().min(0).max(1).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  relatedTasks: z.array(TaskId).default([]),
}).superRefine((data, ctx) => {
  const optionNames = data.options.map(o => o.name);
  if (!optionNames.includes(data.chosenOption)) {
    ctx.addIssue({
      code: 'custom', path: ['chosenOption'],
      message: `Chosen option "${data.chosenOption}" must match one of: ${optionNames.join(', ')}`,
    });
  }
});

export type Adr = z.infer<typeof AdrSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.8 ManifestSchema                                              */
/* ------------------------------------------------------------------ */

export const ManifestSchema = z.object({
  version: ArtifactVersion,
  generated: ISODatetime,
  atsfVersion: SemVer,  // Full N.N.N semantic version
  projectName: z.string().min(1),
  files: z.array(z.object({
    path: RelativeFilePath,
    checksum: Checksum,
    sizeBytes: z.number().int().nonnegative(),
    // See ArtifactType in Section 10.6 for the canonical list.
    artifactType: z.enum([
      'task_graph', 'repo_blueprint', 'mpd',
      'tickets', 'ai_prompt_pack', 'manifest',
    ]),
  })).min(1),
  totalTasks: z.number().int().min(1),
  totalCostUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export type Manifest = z.infer<typeof ManifestSchema>;

/* ------------------------------------------------------------------ */
/*  10.7.9 TypeScript Type Exports                                     */
/* ------------------------------------------------------------------ */

// Re-export TaskGraphArtifact as TaskGraph per Section 10.7.9 spec.
// All other artifact types are already exported inline above.
export type TaskGraph = TaskGraphArtifact;
