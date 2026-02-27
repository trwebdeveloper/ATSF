/**
 * Algorithmic derivation of Tickets and PromptPacks from TaskGraph data.
 * No LLM calls needed — purely mechanical transformation.
 */

import type { TicketInput, PromptPackInput, TaskGraphInput } from '../emitter/types.js';

/* ------------------------------------------------------------------ */
/*  Type aliases for task shape (inferred from TaskGraphInput)          */
/* ------------------------------------------------------------------ */

type Task = TaskGraphInput['tasks'][number];
type AcceptanceCriterion = Task['acceptanceCriteria'][number];

/* ------------------------------------------------------------------ */
/*  Mapping helpers (exported for testing)                              */
/* ------------------------------------------------------------------ */

/**
 * Map TaskType to TicketType.
 * 'feature' → 'feature', 'architecture' → 'architecture', 'testing' → 'testing',
 * 'documentation' → 'documentation', 'review' → 'task', 'infrastructure' → 'chore',
 * 'security' → 'task', 'refactoring' → 'task'
 */
export function mapTaskTypeToTicketType(
  taskType: Task['type'],
): 'feature' | 'bug' | 'task' | 'spike' | 'chore' | 'architecture' | 'testing' | 'documentation' {
  const mapping: Record<
    Task['type'],
    'feature' | 'bug' | 'task' | 'spike' | 'chore' | 'architecture' | 'testing' | 'documentation'
  > = {
    feature: 'feature',
    architecture: 'architecture',
    testing: 'testing',
    documentation: 'documentation',
    review: 'task',
    infrastructure: 'chore',
    security: 'task',
    refactoring: 'task',
  };
  return mapping[taskType];
}

/**
 * Map numeric priority (1–5) to ticket priority string.
 * 1 → 'critical', 2 → 'high', 3 → 'medium', 4,5 → 'low'
 */
export function mapPriority(priority: number): 'critical' | 'high' | 'medium' | 'low' {
  switch (priority) {
    case 1: return 'critical';
    case 2: return 'high';
    case 3: return 'medium';
    default: return 'low'; // 4, 5
  }
}

/**
 * Estimate effort from estimated token count.
 * undefined or < 5000 → '4h', < 20000 → '1d', < 50000 → '3d', else → '1w'
 */
export function estimateFromTokens(estimatedTokens: number | undefined): string {
  if (estimatedTokens === undefined || estimatedTokens < 5000) return '4h';
  if (estimatedTokens < 20000) return '1d';
  if (estimatedTokens < 50000) return '3d';
  return '1w';
}

/**
 * Map estimated tokens to complexity level.
 * undefined or < 5000 → 'trivial', < 15000 → 'low', < 30000 → 'medium',
 * < 80000 → 'high', else → 'very_high'
 */
export function mapTokensToComplexity(
  estimatedTokens: number | undefined,
): 'trivial' | 'low' | 'medium' | 'high' | 'very_high' {
  if (estimatedTokens === undefined || estimatedTokens < 5000) return 'trivial';
  if (estimatedTokens < 15000) return 'low';
  if (estimatedTokens < 30000) return 'medium';
  if (estimatedTokens < 80000) return 'high';
  return 'very_high';
}

/**
 * Map numeric priority to suggested model tier.
 * 1,2 → 'powerful', 3 → 'balanced', 4,5 → 'fast'
 */
export function mapPriorityToModel(priority: number): 'fast' | 'balanced' | 'powerful' {
  if (priority <= 2) return 'powerful';
  if (priority === 3) return 'balanced';
  return 'fast';
}

/**
 * Ensure a string meets a minimum length by padding with a suffix.
 */
export function ensureMinLength(value: string, minLength: number, suffix = ' (details pending)'): string {
  if (value.length >= minLength) return value;
  // Repeat suffix until we meet the minimum length
  let result = value;
  while (result.length < minLength) {
    result += suffix;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  deriveTickets                                                       */
/* ------------------------------------------------------------------ */

/**
 * Derive TicketInput[] from a TaskGraphInput.
 * Pure mechanical transformation — no LLM calls.
 */
export function deriveTickets(taskGraphInput: TaskGraphInput): TicketInput[] {
  return taskGraphInput.tasks.map((task) => {
    const acceptanceCriteria = task.acceptanceCriteria.map(
      (ac: AcceptanceCriterion) => ({
        given: ensureMinLength(`Given the ${task.name} context is set up`, 5),
        when: ensureMinLength(`When ${ac.description}`, 5),
        then: ensureMinLength('Then the criterion is verified successfully', 5),
      }),
    );

    const description = ensureMinLength(task.description, 20);
    const technicalNotes = ensureMinLength(`Files to write: ${task.filesWrite.join(', ')}`, 10);

    return {
      frontmatter: {
        id: task.id,
        title: task.name,
        type: mapTaskTypeToTicketType(task.type),
        priority: mapPriority(task.priority),
        estimate: estimateFromTokens(task.estimatedTokens),
        dependencies: task.dependsOn,
        labels: task.tags,
        assignee: 'unassigned',
        status: 'backlog' as const,
      },
      body: {
        description,
        acceptanceCriteria,
        technicalNotes,
        relatedDecisions: [],
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Prompt pack helpers (exported for testing)                          */
/* ------------------------------------------------------------------ */

/**
 * Build inputFiles for a task by finding which other tasks write the files this task reads.
 */
export function buildInputFiles(
  task: Task,
  allTasks: readonly Task[],
): Array<{ filePath: string; sourceTask: string; description?: string }> {
  const result: Array<{ filePath: string; sourceTask: string; description?: string }> = [];

  for (const filePath of task.filesRead) {
    // Find which task writes this file
    const sourceTask = allTasks.find(
      (t) => t.id !== task.id && t.filesWrite.includes(filePath),
    );
    if (sourceTask) {
      result.push({
        filePath,
        sourceTask: sourceTask.id,
        description: ensureMinLength(`Input from ${sourceTask.name}`, 5),
      });
    }
  }

  return result;
}

/**
 * Build sequential instruction steps from task description and acceptance criteria.
 */
export function buildInstructions(
  task: Task,
): Array<{ step: number; instruction: string }> {
  const instructions: Array<{ step: number; instruction: string }> = [];
  let stepNum = 1;

  // Step 1: Read and understand the task
  instructions.push({
    step: stepNum++,
    instruction: ensureMinLength(`Understand the task: ${task.description}`, 10),
  });

  // Step 2: Set up the required files
  instructions.push({
    step: stepNum++,
    instruction: ensureMinLength(`Create or modify the output files: ${task.filesWrite.join(', ')}`, 10),
  });

  // Steps for each acceptance criterion
  for (const ac of task.acceptanceCriteria) {
    instructions.push({
      step: stepNum++,
      instruction: ensureMinLength(`Implement and verify: ${ac.description}`, 10),
    });
  }

  // Final step: Validate
  instructions.push({
    step: stepNum++,
    instruction: ensureMinLength('Validate all acceptance criteria are met and run tests', 10),
  });

  return instructions;
}

/* ------------------------------------------------------------------ */
/*  derivePromptPacks                                                   */
/* ------------------------------------------------------------------ */

/**
 * Derive PromptPackInput[] from a TaskGraphInput.
 * Pure mechanical transformation — no LLM calls.
 */
export function derivePromptPacks(taskGraphInput: TaskGraphInput): PromptPackInput[] {
  const allTasks = taskGraphInput.tasks;

  return allTasks.map((task) => {
    // Build context string (min 20 chars)
    const context = ensureMinLength(
      `Task: ${task.name}\n\nDescription: ${task.description}\n\nAgent: ${task.agent}\nType: ${task.type}\nPriority: ${task.priority}`,
      20,
    );

    // Build output files contract
    const outputFiles = task.filesWrite.map((filePath) => ({
      filePath,
      exports: [] as string[],
      description: ensureMinLength(`Output file for ${task.name}`, 5),
    }));

    // Build input files
    const inputFiles = buildInputFiles(task, allTasks);

    // Build instructions
    const instructions = buildInstructions(task);

    // Build constraints (min 1, each min 5 chars)
    const constraints = [
      ensureMinLength(`Agent type: ${task.agent}`, 5),
      ensureMinLength(`Task type: ${task.type}`, 5),
      ...task.tags.map((t) => ensureMinLength(`Tag: ${t}`, 5)),
    ];

    // Build test criteria (min 1, each min 5 chars)
    const testCriteria = task.acceptanceCriteria.map((ac) =>
      ensureMinLength(ac.description, 5),
    );

    // Build previous task outputs
    const previousTaskOutputs: Array<{
      taskId: string;
      filePath: string;
      injectionPoint: string;
      mode: 'full' | 'summary' | 'reference';
    }> = [];

    for (const depId of task.dependsOn) {
      const depTask = allTasks.find((t) => t.id === depId);
      if (depTask && depTask.id !== task.id) {
        for (const filePath of depTask.filesWrite) {
          previousTaskOutputs.push({
            taskId: depTask.id,
            filePath,
            injectionPoint: ensureMinLength(`Output from ${depTask.name}`, 1),
            mode: 'reference',
          });
        }
      }
    }

    return {
      taskId: task.id,
      taskName: task.name,
      context,
      contract: {
        outputFiles,
        exports: [] as string[],
        dependencies: [] as Array<{ name: string; version: string; purpose?: string }>,
      },
      inputFiles,
      instructions,
      constraints,
      testCriteria,
      estimatedComplexity: mapTokensToComplexity(task.estimatedTokens),
      suggestedModel: mapPriorityToModel(task.priority),
      previousTaskOutputs,
    };
  });
}
