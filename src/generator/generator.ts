/**
 * Generator — orchestrates LLM calls to produce all artifact inputs from a project description.
 *
 * Flow:
 *   1. Call LLM to generate TaskGraphInput (sequential — informs later calls)
 *   2. Call LLM to generate RepoBlueprintInput (sequential — needs task list)
 *   3. Call LLM to generate MpdInput in 3 parallel sub-calls (core/design/plan)
 *   4. Derive TicketInput[] and PromptPackInput[] algorithmically
 */

import type { GenerateResponse } from '../providers/types.js';
import type { TaskGraphInput, RepoBlueprintInput, MpdInput } from '../emitter/types.js';
import type { GeneratorConfig, GeneratorResult } from './types.js';
import {
  TaskGraphLLMSchema,
  RepoBlueprintLLMSchema,
  MpdCoreLLMSchema,
  MpdDesignLLMSchema,
  MpdPlanLLMSchema,
} from './schemas.js';
import type { MpdCoreLLMOutput, MpdDesignLLMOutput, MpdPlanLLMOutput } from './schemas.js';
import {
  TASK_GRAPH_SYSTEM_PROMPT,
  REPO_BLUEPRINT_SYSTEM_PROMPT,
  MPD_SYSTEM_PROMPT,
  buildTaskGraphPrompt,
  buildRepoBlueprintPrompt,
  buildMpdPrompt,
  buildSystemPrompt,
} from './prompts.js';
import { deriveTickets, derivePromptPacks } from './derive.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function log(msg: string): void {
  process.stderr.write(`  ${msg}\n`);
}

/* Canonical values accepted by contract schemas */
const VALID_AGENTS = new Set(['planner', 'architect', 'critic', 'judge', 'builder', 'reviewer', 'documenter', 'integrator']);
const VALID_TYPES = new Set(['feature', 'architecture', 'testing', 'documentation', 'review', 'infrastructure', 'security', 'refactoring']);
const AGENT_MAP: Record<string, string> = { tester: 'reviewer', designer: 'architect', devops: 'integrator', analyst: 'planner' };
const TYPE_MAP: Record<string, string> = { deployment: 'infrastructure', design: 'architecture', optimization: 'refactoring', configuration: 'infrastructure' };

/** Normalize LLM-generated task fields to canonical enum values. */
function normalizeTask(task: TaskGraphInput['tasks'][number]): TaskGraphInput['tasks'][number] {
  const agent = VALID_AGENTS.has(task.agent) ? task.agent : (AGENT_MAP[task.agent] ?? 'builder');
  const type = VALID_TYPES.has(task.type) ? task.type : (TYPE_MAP[task.type] ?? 'feature');
  return { ...task, agent: agent as typeof task.agent, type: type as typeof task.type };
}

/** Fill in defaults for any missing MPD sections. */
function normalizeMpd(raw: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    executiveSummary: { projectName: '', oneLiner: '', objectives: [], targetAudience: [], scope: { inScope: [], outOfScope: [] } },
    projectOverview: { background: '', problemStatement: '', proposedSolution: '', successCriteria: [], assumptions: [] },
    technicalArchitecture: { overview: '', diagrams: [], patterns: [], techStack: [] },
    componentDesign: { components: [], diagrams: [] },
    dataModel: { overview: '', entities: [], diagrams: [] },
    apiDesign: { overview: '', endpoints: [], authStrategy: '' },
    securityConsiderations: { overview: '', threatModel: [] },
    testingStrategy: { overview: '', levels: [], taskRefs: [] },
    deploymentPlan: { overview: '', environments: [], cicdPipeline: '' },
    riskAssessment: { risks: [] },
    timeline: { phases: [], criticalPath: [] },
    glossary: { terms: [] },
    appendices: { adrs: [], references: [] },
  };
  const result: Record<string, unknown> = {};
  for (const [key, defaultVal] of Object.entries(defaults)) {
    const val = raw[key];
    if (val && typeof val === 'object') {
      result[key] = { ...(defaultVal as Record<string, unknown>), ...(val as Record<string, unknown>) };
    } else {
      result[key] = defaultVal;
    }
  }
  return result;
}

/** Build a short summary of tasks for use in subsequent prompts. */
function summarizeTasks(tasks: TaskGraphInput['tasks']): string {
  return tasks.map(t =>
    `- ${t.id}: ${t.name} (${t.type}, agent: ${t.agent}, depends: [${t.dependsOn.join(', ')}], files: [${t.filesWrite.join(', ')}])`
  ).join('\n');
}

/** Accumulate token usage from a response. */
function addUsage(totals: { tokens: number; cost: number }, response: GenerateResponse): void {
  totals.tokens += response.usage.totalTokens;
  totals.cost += response.usage.totalTokens * 0.000001;
}

/* ------------------------------------------------------------------ */
/*  Main generate function                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate all artifact inputs from a project description using LLM calls.
 *
 * Makes 5 LLM calls total:
 *   1. TaskGraph generation (sequential)
 *   2. RepoBlueprint generation (sequential, depends on #1)
 *   3a/3b/3c. MPD sections (parallel, depend on #1)
 * Then derives tickets and prompt packs algorithmically.
 */
export async function generate(
  projectDescription: string,
  projectName: string,
  config: GeneratorConfig,
): Promise<GeneratorResult> {
  const { provider, model, lang, signal } = config;
  const usage = { tokens: 0, cost: 0 };

  // ── Step 1: Generate TaskGraph ──────────────────────────────────────
  if (signal?.aborted) throw new Error('Aborted before TaskGraph generation');
  log('[1/5] Generating task graph...');

  const taskGraphResponse = await provider.generate({
    model,
    prompt: buildTaskGraphPrompt(projectDescription, projectName),
    systemPrompt: buildSystemPrompt(TASK_GRAPH_SYSTEM_PROMPT, lang),
    schema: TaskGraphLLMSchema,
    temperature: 0.3,
    signal,
  });
  addUsage(usage, taskGraphResponse);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTaskGraph = taskGraphResponse.object as any;
  const taskGraphInput: TaskGraphInput = {
    ...rawTaskGraph,
    project: rawTaskGraph.project ?? {
      name: projectName,
      description: projectDescription.slice(0, 5000),
      techStack: [],
      constraints: [],
    },
    tasks: (rawTaskGraph.tasks as TaskGraphInput['tasks']).map(normalizeTask),
  };
  log(`  -> ${taskGraphInput.tasks.length} tasks generated`);

  const tasksSummary = summarizeTasks(taskGraphInput.tasks);

  // ── Step 2: Generate RepoBlueprint ─────────────────────────────────
  if (signal?.aborted) throw new Error('Aborted before RepoBlueprint generation');
  log('[2/5] Generating repo blueprint...');

  const blueprintResponse = await provider.generate({
    model,
    prompt: buildRepoBlueprintPrompt(projectDescription, tasksSummary),
    systemPrompt: buildSystemPrompt(REPO_BLUEPRINT_SYSTEM_PROMPT, lang),
    schema: RepoBlueprintLLMSchema,
    temperature: 0.3,
    signal,
  });
  addUsage(usage, blueprintResponse);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBlueprint = blueprintResponse.object as any;
  const repoBlueprintInput: RepoBlueprintInput = {
    projectName: rawBlueprint?.projectName ?? projectName,
    root: rawBlueprint?.root ?? rawBlueprint?.children ?? rawBlueprint?.tree ?? [],
  };
  log(`  -> ${repoBlueprintInput.root.length} root nodes`);

  // ── Step 3: Generate MPD (3 parallel sub-calls) ────────────────────
  if (signal?.aborted) throw new Error('Aborted before MPD generation');
  log('[3/5] Generating MPD (3 parallel calls)...');

  const mpdSystemPrompt = buildSystemPrompt(MPD_SYSTEM_PROMPT, lang);

  const [mpdCoreResponse, mpdDesignResponse, mpdPlanResponse] = await Promise.all([
    provider.generate({
      model,
      prompt: buildMpdPrompt(projectDescription, tasksSummary, 'core'),
      systemPrompt: mpdSystemPrompt,
      schema: MpdCoreLLMSchema,
      temperature: 0.4,
      signal,
    }),
    provider.generate({
      model,
      prompt: buildMpdPrompt(projectDescription, tasksSummary, 'design'),
      systemPrompt: mpdSystemPrompt,
      schema: MpdDesignLLMSchema,
      temperature: 0.4,
      signal,
    }),
    provider.generate({
      model,
      prompt: buildMpdPrompt(projectDescription, tasksSummary, 'plan'),
      systemPrompt: mpdSystemPrompt,
      schema: MpdPlanLLMSchema,
      temperature: 0.4,
      signal,
    }),
  ]);

  addUsage(usage, mpdCoreResponse);
  addUsage(usage, mpdDesignResponse);
  addUsage(usage, mpdPlanResponse);
  log('  -> MPD sections complete');

  const mpdCore = mpdCoreResponse.object as MpdCoreLLMOutput;
  const mpdDesign = mpdDesignResponse.object as MpdDesignLLMOutput;
  const mpdPlan = mpdPlanResponse.object as MpdPlanLLMOutput;

  // Merge MPD parts with defaults for any missing sections
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mpdInput: MpdInput = normalizeMpd({ ...mpdCore, ...mpdDesign, ...mpdPlan }) as any;

  // ── Step 4: Derive tickets + prompt packs algorithmically ──────────
  log('[4/5] Deriving tickets and prompt packs...');
  const ticketsInput = deriveTickets(taskGraphInput);
  const promptPackInput = derivePromptPacks(taskGraphInput);
  log(`  -> ${ticketsInput.length} tickets, ${promptPackInput.length} prompt packs`);

  log('[5/5] Complete!');

  return {
    taskGraphInput,
    repoBlueprintInput,
    mpdInput,
    ticketsInput,
    promptPackInput,
    totalTokensUsed: usage.tokens,
    totalCostUsd: usage.cost,
  };
}
