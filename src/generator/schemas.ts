/**
 * Generator LLM-facing Zod schemas — T14
 *
 * These schemas mirror the contract schemas from artifact-schemas.ts but are
 * designed for use with the Vercel AI SDK's generateObject / structured output.
 *
 * Key differences from contract schemas:
 * - No `version`, `generated`, `checksum` fields (added by emitters)
 * - No `superRefine` calls (AI SDK can't serialize superRefine to JSON Schema)
 * - RepoBlueprintNode uses depth-limited nesting (4 levels) instead of z.lazy()
 *
 * Field-level validators (min/max, regex, enums) are kept identical to the contracts.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Shared primitives (same validators as contracts)                   */
/* ------------------------------------------------------------------ */

// LLM-facing: use plain strings since models often generate synonyms.
// The generator normalizes these to canonical enum values before emitting.
const AgentType = z.string().min(1);
const TaskType = z.string().min(1);

/* ------------------------------------------------------------------ */
/*  AcceptanceCriterion                                                */
/* ------------------------------------------------------------------ */

const AcceptanceCriterion = z.object({
  description: z.string().min(1),
  testable: z.boolean().default(true),
});

/* ------------------------------------------------------------------ */
/*  TaskNodeArtifact (LLM version — no superRefine)                    */
/* ------------------------------------------------------------------ */

const TaskNodeLLM = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  agent: AgentType,
  type: TaskType,
  dependsOn: z.array(z.string()).default([]),
  filesWrite: z.array(z.string().min(1)).min(1),
  filesRead: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(10).default(3),
  estimatedTokens: z.number().optional(),
  category: z.string().optional(),
  acceptanceCriteria: z.array(AcceptanceCriterion).default([]),
  tags: z.array(z.string()).default([]),
});

/* ------------------------------------------------------------------ */
/*  ProjectMeta                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  TaskGraphLLMSchema                                                 */
/* ------------------------------------------------------------------ */

/**
 * LLM-facing task graph schema.
 * Omits version/generated/checksum (added by emitter) and superRefine (not serializable).
 */
export const TaskGraphLLMSchema = z.object({
  project: ProjectMeta.optional(),
  tasks: z.array(TaskNodeLLM).min(1),
});

export type TaskGraphLLMOutput = z.infer<typeof TaskGraphLLMSchema>;

/* ------------------------------------------------------------------ */
/*  RepoBlueprintNode (depth-limited, no z.lazy())                     */
/* ------------------------------------------------------------------ */

/**
 * Build a depth-limited RepoBlueprintNode schema.
 * z.lazy() does not serialize well to JSON Schema, so we unroll to 4 levels.
 */
function buildBlueprintNode(depth: number): z.ZodTypeAny {
  const base = {
    name: z.string().min(1).max(255),
    type: z.enum(['dir', 'file']),
    purpose: z.string().min(1).max(500),
    generatedBy: z.string().optional(),
    language: z.string().min(1).max(30).optional(),
    dependencies: z.array(z.string().min(1)).optional(),
  };

  if (depth <= 0) {
    // Leaf level — no children allowed
    return z.object(base);
  }

  return z.object({
    ...base,
    children: z.array(buildBlueprintNode(depth - 1)).optional(),
  });
}

const RepoBlueprintNodeLLM = buildBlueprintNode(4);

/* ------------------------------------------------------------------ */
/*  RepoBlueprintLLMSchema                                             */
/* ------------------------------------------------------------------ */

/**
 * LLM-facing repo blueprint schema.
 * Omits version/generated/checksum. Uses depth-limited nodes instead of z.lazy().
 */
export const RepoBlueprintLLMSchema = z.object({
  projectName: z.string().min(1).max(200),
  root: z.array(RepoBlueprintNodeLLM).min(1),
});

export type RepoBlueprintLLMOutput = z.infer<typeof RepoBlueprintLLMSchema>;

/* ------------------------------------------------------------------ */
/*  MPD sub-schemas (split into 3 parts for chunked generation)        */
/* ------------------------------------------------------------------ */

const MermaidDiagram = z.object({
  type: z.enum([
    'flowchart', 'sequenceDiagram', 'erDiagram',
    'classDiagram', 'stateDiagram', 'gantt', 'graph',
  ]),
  title: z.string().min(1).max(200),
  source: z.string().min(10),
});

/**
 * MPD Core: executiveSummary, projectOverview, technicalArchitecture, componentDesign.
 */
export const MpdCoreLLMSchema = z.object({
  executiveSummary: z.object({
    projectName: z.string().min(1),
    oneLiner: z.string().min(1),
    objectives: z.array(z.string()).default([]),
    targetAudience: z.array(z.string()).default([]),
    scope: z.object({
      inScope: z.array(z.string()).default([]),
      outOfScope: z.array(z.string()).default([]),
    }).optional(),
  }).optional(),
  projectOverview: z.object({
    background: z.string().min(1),
    problemStatement: z.string().min(1),
    proposedSolution: z.string().min(1),
    successCriteria: z.array(z.string()).default([]),
    assumptions: z.array(z.object({
      id: z.string(),
      description: z.string().min(1),
      source: z.string(),
    })).default([]),
  }).optional(),
  technicalArchitecture: z.object({
    overview: z.string().min(1),
    diagrams: z.array(MermaidDiagram).default([]),
    patterns: z.array(z.object({
      name: z.string().min(1),
      rationale: z.string().min(1),
      adrRef: z.string().optional(),
    })).default([]),
    techStack: z.array(z.object({
      name: z.string().min(1),
      version: z.string().optional(),
      purpose: z.string().min(1),
      category: z.string().optional(),
    })).default([]),
  }).optional(),
  componentDesign: z.object({
    components: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      responsibilities: z.array(z.string()).default([]),
      interfaces: z.array(z.string()).default([]),
      dependencies: z.array(z.string()).default([]),
      taskRefs: z.array(z.string()).default([]),
    })).default([]),
    diagrams: z.array(MermaidDiagram).optional(),
  }).optional(),
});

export type MpdCoreLLMOutput = z.infer<typeof MpdCoreLLMSchema>;

/**
 * MPD Design: dataModel, apiDesign, securityConsiderations, testingStrategy.
 */
export const MpdDesignLLMSchema = z.object({
  dataModel: z.object({
    overview: z.string().min(1),
    entities: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      fields: z.array(z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        constraints: z.string().optional(),
        description: z.string().optional(),
      })).default([]),
      relationships: z.array(z.string()).default([]),
    })).default([]),
    diagrams: z.array(MermaidDiagram).optional(),
  }).optional(),
  apiDesign: z.object({
    overview: z.string().min(1),
    endpoints: z.array(z.object({
      method: z.string().min(1),
      path: z.string().min(1),
      description: z.string().min(1),
      taskRef: z.string().optional(),
    })).default([]),
    authStrategy: z.string().optional(),
  }).optional(),
  securityConsiderations: z.object({
    overview: z.string().min(1),
    threatModel: z.array(z.object({
      threat: z.string().min(1),
      severity: z.string(),
      mitigation: z.string().min(1),
      taskRef: z.string().optional(),
    })).default([]),
  }).optional(),
  testingStrategy: z.object({
    overview: z.string().min(1),
    levels: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      tools: z.array(z.string()).default([]),
      coverageTarget: z.string().optional(),
    })).default([]),
    taskRefs: z.array(z.string()).default([]),
  }).optional(),
});

export type MpdDesignLLMOutput = z.infer<typeof MpdDesignLLMSchema>;

/**
 * MPD Plan: deploymentPlan, riskAssessment, timeline, glossary, appendices.
 */
export const MpdPlanLLMSchema = z.object({
  deploymentPlan: z.object({
    overview: z.string().min(10),
    environments: z.array(z.object({
      name: z.string().min(1),
      purpose: z.string().min(1),
      infrastructure: z.string().optional(),
    })).default([]),
    cicdPipeline: z.string().optional(),
  }).optional(),
  riskAssessment: z.object({
    risks: z.array(z.object({
      id: z.string(),
      description: z.string().min(5),
      probability: z.string(),
      impact: z.string(),
      mitigation: z.string().min(1),
    })).default([]),
  }).optional(),
  timeline: z.object({
    phases: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      taskRefs: z.array(z.string()).default([]),
    })).default([]),
    criticalPath: z.array(z.string()).default([]),
    diagram: MermaidDiagram.optional(),
  }).optional(),
  glossary: z.object({
    terms: z.array(z.object({
      term: z.string().min(1),
      definition: z.string().min(1),
    })).default([]),
  }).optional(),
  appendices: z.object({
    adrs: z.array(z.object({
      id: z.string(),
      title: z.string().min(1),
      status: z.string(),
      summary: z.string().min(1),
    })).default([]),
    references: z.array(z.object({
      title: z.string().min(1),
      url: z.string().optional(),
      description: z.string().optional(),
    })).default([]),
  }).optional(),
});

export type MpdPlanLLMOutput = z.infer<typeof MpdPlanLLMSchema>;
