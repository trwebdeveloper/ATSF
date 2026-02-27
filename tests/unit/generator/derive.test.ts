/**
 * Unit tests for src/generator/derive.ts
 *
 * Tests all exported functions:
 *   mapTaskTypeToTicketType, mapPriority, estimateFromTokens, mapTokensToComplexity,
 *   mapPriorityToModel, ensureMinLength, deriveTickets, buildInputFiles,
 *   buildInstructions, derivePromptPacks
 */

import { describe, it, expect } from 'vitest';
import type { TaskGraphInput } from '../../../src/emitter/types.js';
import {
  mapTaskTypeToTicketType,
  mapPriority,
  estimateFromTokens,
  mapTokensToComplexity,
  mapPriorityToModel,
  ensureMinLength,
  deriveTickets,
  buildInputFiles,
  buildInstructions,
  derivePromptPacks,
} from '../../../src/generator/derive.js';

/* ------------------------------------------------------------------ */
/*  Helpers: mock TaskGraphInput factory                                */
/* ------------------------------------------------------------------ */

function makeTask(overrides: Partial<TaskGraphInput['tasks'][number]> = {}): TaskGraphInput['tasks'][number] {
  return {
    id: 'TASK-001',
    name: 'Implement auth module',
    description: 'Build the authentication module with JWT support',
    agent: 'builder',
    type: 'feature',
    dependsOn: [],
    filesWrite: ['src/auth/index.ts'],
    filesRead: [],
    priority: 2,
    estimatedTokens: 10000,
    acceptanceCriteria: [
      { description: 'JWT tokens are generated correctly', testable: true },
    ],
    tags: ['auth', 'security'],
    ...overrides,
  };
}

function makeTaskGraphInput(tasks: TaskGraphInput['tasks']): TaskGraphInput {
  return {
    project: {
      name: 'Test Project',
      description: 'A test project for unit testing derive functions',
      constraints: [],
    },
    tasks,
  };
}

/**
 * Build a realistic multi-task TaskGraphInput with dependencies and file cross-references.
 */
function makeMultiTaskInput(): TaskGraphInput {
  return makeTaskGraphInput([
    makeTask({
      id: 'TASK-001',
      name: 'Define database schema',
      description: 'Create the database schema for the application models',
      agent: 'architect',
      type: 'architecture',
      dependsOn: [],
      filesWrite: ['src/db/schema.ts', 'src/db/migrations/001.sql'],
      filesRead: [],
      priority: 1,
      estimatedTokens: 8000,
      acceptanceCriteria: [
        { description: 'Schema defines all required entities', testable: true },
        { description: 'Migration file is idempotent and reversible', testable: true },
      ],
      tags: ['database', 'schema'],
    }),
    makeTask({
      id: 'TASK-002',
      name: 'Implement data access layer',
      description: 'Build repository pattern over the database schema',
      agent: 'builder',
      type: 'feature',
      dependsOn: ['TASK-001'],
      filesWrite: ['src/db/repository.ts'],
      filesRead: ['src/db/schema.ts'],
      priority: 2,
      estimatedTokens: 25000,
      acceptanceCriteria: [
        { description: 'CRUD operations work for all entities', testable: true },
      ],
      tags: ['database', 'repository'],
    }),
    makeTask({
      id: 'TASK-003',
      name: 'Write integration tests',
      description: 'Create integration tests for the data access layer',
      agent: 'builder',
      type: 'testing',
      dependsOn: ['TASK-001', 'TASK-002'],
      filesWrite: ['tests/integration/db.test.ts'],
      filesRead: ['src/db/schema.ts', 'src/db/repository.ts'],
      priority: 3,
      estimatedTokens: 4000,
      acceptanceCriteria: [
        { description: 'All CRUD operations have test coverage', testable: true },
        { description: 'Edge cases for empty results are covered', testable: true },
      ],
      tags: ['testing'],
    }),
  ]);
}

/* ================================================================== */
/*  mapTaskTypeToTicketType                                            */
/* ================================================================== */

describe('mapTaskTypeToTicketType', () => {
  it('maps "feature" to "feature"', () => {
    expect(mapTaskTypeToTicketType('feature')).toBe('feature');
  });

  it('maps "architecture" to "architecture"', () => {
    expect(mapTaskTypeToTicketType('architecture')).toBe('architecture');
  });

  it('maps "testing" to "testing"', () => {
    expect(mapTaskTypeToTicketType('testing')).toBe('testing');
  });

  it('maps "documentation" to "documentation"', () => {
    expect(mapTaskTypeToTicketType('documentation')).toBe('documentation');
  });

  it('maps "review" to "task"', () => {
    expect(mapTaskTypeToTicketType('review')).toBe('task');
  });

  it('maps "infrastructure" to "chore"', () => {
    expect(mapTaskTypeToTicketType('infrastructure')).toBe('chore');
  });

  it('maps "security" to "task"', () => {
    expect(mapTaskTypeToTicketType('security')).toBe('task');
  });

  it('maps "refactoring" to "task"', () => {
    expect(mapTaskTypeToTicketType('refactoring')).toBe('task');
  });
});

/* ================================================================== */
/*  mapPriority                                                        */
/* ================================================================== */

describe('mapPriority', () => {
  it('maps 1 to "critical"', () => {
    expect(mapPriority(1)).toBe('critical');
  });

  it('maps 2 to "high"', () => {
    expect(mapPriority(2)).toBe('high');
  });

  it('maps 3 to "medium"', () => {
    expect(mapPriority(3)).toBe('medium');
  });

  it('maps 4 to "low"', () => {
    expect(mapPriority(4)).toBe('low');
  });

  it('maps 5 to "low"', () => {
    expect(mapPriority(5)).toBe('low');
  });

  it('maps values above 5 to "low" (default case)', () => {
    expect(mapPriority(10)).toBe('low');
  });

  it('maps 0 to "low" (default case)', () => {
    expect(mapPriority(0)).toBe('low');
  });
});

/* ================================================================== */
/*  estimateFromTokens                                                 */
/* ================================================================== */

describe('estimateFromTokens', () => {
  it('returns "4h" for undefined', () => {
    expect(estimateFromTokens(undefined)).toBe('4h');
  });

  it('returns "4h" for 0 tokens', () => {
    expect(estimateFromTokens(0)).toBe('4h');
  });

  it('returns "4h" for 4999 tokens', () => {
    expect(estimateFromTokens(4999)).toBe('4h');
  });

  it('returns "1d" for exactly 5000 tokens', () => {
    expect(estimateFromTokens(5000)).toBe('1d');
  });

  it('returns "1d" for 19999 tokens', () => {
    expect(estimateFromTokens(19999)).toBe('1d');
  });

  it('returns "3d" for exactly 20000 tokens', () => {
    expect(estimateFromTokens(20000)).toBe('3d');
  });

  it('returns "3d" for 49999 tokens', () => {
    expect(estimateFromTokens(49999)).toBe('3d');
  });

  it('returns "1w" for exactly 50000 tokens', () => {
    expect(estimateFromTokens(50000)).toBe('1w');
  });

  it('returns "1w" for very large token counts', () => {
    expect(estimateFromTokens(500000)).toBe('1w');
  });
});

/* ================================================================== */
/*  mapTokensToComplexity                                              */
/* ================================================================== */

describe('mapTokensToComplexity', () => {
  it('returns "trivial" for undefined', () => {
    expect(mapTokensToComplexity(undefined)).toBe('trivial');
  });

  it('returns "trivial" for 0 tokens', () => {
    expect(mapTokensToComplexity(0)).toBe('trivial');
  });

  it('returns "trivial" for 4999 tokens', () => {
    expect(mapTokensToComplexity(4999)).toBe('trivial');
  });

  it('returns "low" for exactly 5000 tokens', () => {
    expect(mapTokensToComplexity(5000)).toBe('low');
  });

  it('returns "low" for 14999 tokens', () => {
    expect(mapTokensToComplexity(14999)).toBe('low');
  });

  it('returns "medium" for exactly 15000 tokens', () => {
    expect(mapTokensToComplexity(15000)).toBe('medium');
  });

  it('returns "medium" for 29999 tokens', () => {
    expect(mapTokensToComplexity(29999)).toBe('medium');
  });

  it('returns "high" for exactly 30000 tokens', () => {
    expect(mapTokensToComplexity(30000)).toBe('high');
  });

  it('returns "high" for 79999 tokens', () => {
    expect(mapTokensToComplexity(79999)).toBe('high');
  });

  it('returns "very_high" for exactly 80000 tokens', () => {
    expect(mapTokensToComplexity(80000)).toBe('very_high');
  });

  it('returns "very_high" for very large token counts', () => {
    expect(mapTokensToComplexity(500000)).toBe('very_high');
  });
});

/* ================================================================== */
/*  mapPriorityToModel                                                 */
/* ================================================================== */

describe('mapPriorityToModel', () => {
  it('maps priority 1 to "powerful"', () => {
    expect(mapPriorityToModel(1)).toBe('powerful');
  });

  it('maps priority 2 to "powerful"', () => {
    expect(mapPriorityToModel(2)).toBe('powerful');
  });

  it('maps priority 3 to "balanced"', () => {
    expect(mapPriorityToModel(3)).toBe('balanced');
  });

  it('maps priority 4 to "fast"', () => {
    expect(mapPriorityToModel(4)).toBe('fast');
  });

  it('maps priority 5 to "fast"', () => {
    expect(mapPriorityToModel(5)).toBe('fast');
  });

  it('maps priority 0 to "powerful" (less than or equal to 2)', () => {
    expect(mapPriorityToModel(0)).toBe('powerful');
  });

  it('maps priority 6 to "fast" (greater than 3)', () => {
    expect(mapPriorityToModel(6)).toBe('fast');
  });
});

/* ================================================================== */
/*  ensureMinLength                                                    */
/* ================================================================== */

describe('ensureMinLength', () => {
  it('returns the original string if it already meets the minimum length', () => {
    expect(ensureMinLength('hello world', 5)).toBe('hello world');
  });

  it('returns the original string if length equals minLength exactly', () => {
    const str = 'abcde';
    expect(ensureMinLength(str, 5)).toBe('abcde');
  });

  it('pads with default suffix when string is too short', () => {
    const result = ensureMinLength('hi', 20);
    expect(result.length).toBeGreaterThanOrEqual(20);
    expect(result).toContain('hi');
    expect(result).toContain('(details pending)');
  });

  it('uses a custom suffix when provided', () => {
    const result = ensureMinLength('ab', 10, '...');
    expect(result.length).toBeGreaterThanOrEqual(10);
    expect(result.startsWith('ab')).toBe(true);
    expect(result).toContain('...');
  });

  it('repeats the suffix until minimum length is met', () => {
    const result = ensureMinLength('x', 10, '-pad');
    expect(result.length).toBeGreaterThanOrEqual(10);
    // Should be 'x' + '-pad' repeated enough times
    expect(result.startsWith('x')).toBe(true);
  });

  it('handles an empty string', () => {
    const result = ensureMinLength('', 5);
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('handles minLength of 0', () => {
    expect(ensureMinLength('', 0)).toBe('');
    expect(ensureMinLength('test', 0)).toBe('test');
  });

  it('does not pad if string is longer than minLength', () => {
    const str = 'a very long string that exceeds any reasonable minimum';
    expect(ensureMinLength(str, 5)).toBe(str);
  });
});

/* ================================================================== */
/*  buildInputFiles                                                    */
/* ================================================================== */

describe('buildInputFiles', () => {
  it('returns empty array when task has no filesRead', () => {
    const input = makeMultiTaskInput();
    const task = input.tasks[0]; // TASK-001 has no filesRead
    const result = buildInputFiles(task, input.tasks);
    expect(result).toEqual([]);
  });

  it('finds source tasks for files that are read', () => {
    const input = makeMultiTaskInput();
    const task = input.tasks[1]; // TASK-002 reads src/db/schema.ts (written by TASK-001)
    const result = buildInputFiles(task, input.tasks);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe('src/db/schema.ts');
    expect(result[0].sourceTask).toBe('TASK-001');
    expect(result[0].description).toBeDefined();
    expect(result[0].description!.length).toBeGreaterThanOrEqual(5);
  });

  it('finds multiple source tasks for files read by a downstream task', () => {
    const input = makeMultiTaskInput();
    const task = input.tasks[2]; // TASK-003 reads schema.ts (TASK-001) and repository.ts (TASK-002)
    const result = buildInputFiles(task, input.tasks);

    expect(result).toHaveLength(2);

    const filePaths = result.map((r) => r.filePath);
    expect(filePaths).toContain('src/db/schema.ts');
    expect(filePaths).toContain('src/db/repository.ts');

    const schemaInput = result.find((r) => r.filePath === 'src/db/schema.ts')!;
    expect(schemaInput.sourceTask).toBe('TASK-001');

    const repoInput = result.find((r) => r.filePath === 'src/db/repository.ts')!;
    expect(repoInput.sourceTask).toBe('TASK-002');
  });

  it('excludes files that no other task writes', () => {
    const task = makeTask({
      id: 'TASK-010',
      filesRead: ['src/external/config.json'],
      filesWrite: ['src/output.ts'],
    });
    const allTasks = [task];
    const result = buildInputFiles(task, allTasks);
    expect(result).toEqual([]);
  });

  it('does not include the task itself as a source', () => {
    // A task that reads a file it also writes should not reference itself
    const task = makeTask({
      id: 'TASK-010',
      filesRead: ['src/auth/index.ts'],
      filesWrite: ['src/auth/index.ts'],
    });
    const allTasks = [task];
    const result = buildInputFiles(task, allTasks);
    expect(result).toEqual([]);
  });

  it('includes description with ensured minimum length', () => {
    const input = makeMultiTaskInput();
    const task = input.tasks[1]; // TASK-002
    const result = buildInputFiles(task, input.tasks);

    for (const entry of result) {
      expect(entry.description).toBeDefined();
      expect(entry.description!.length).toBeGreaterThanOrEqual(5);
    }
  });
});

/* ================================================================== */
/*  buildInstructions                                                  */
/* ================================================================== */

describe('buildInstructions', () => {
  it('generates sequential step numbers starting at 1', () => {
    const task = makeTask({
      acceptanceCriteria: [
        { description: 'Criterion one is validated properly', testable: true },
        { description: 'Criterion two is validated properly', testable: true },
      ],
    });
    const result = buildInstructions(task);

    // 1 (understand) + 1 (create/modify files) + 2 (criteria) + 1 (validate) = 5
    expect(result).toHaveLength(5);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].step).toBe(i + 1);
    }
  });

  it('always starts with an "understand the task" step', () => {
    const task = makeTask();
    const result = buildInstructions(task);
    expect(result[0].instruction).toContain('Understand the task');
    expect(result[0].instruction).toContain(task.description);
  });

  it('includes a "create or modify output files" step as step 2', () => {
    const task = makeTask({ filesWrite: ['src/a.ts', 'src/b.ts'] });
    const result = buildInstructions(task);
    expect(result[1].instruction).toContain('Create or modify the output files');
    expect(result[1].instruction).toContain('src/a.ts');
    expect(result[1].instruction).toContain('src/b.ts');
  });

  it('includes one step per acceptance criterion', () => {
    const task = makeTask({
      acceptanceCriteria: [
        { description: 'First criterion is satisfied', testable: true },
        { description: 'Second criterion is satisfied', testable: true },
        { description: 'Third criterion is satisfied', testable: true },
      ],
    });
    const result = buildInstructions(task);

    // Steps 3, 4, 5 should be the criteria (after understand + create files)
    expect(result[2].instruction).toContain('First criterion is satisfied');
    expect(result[3].instruction).toContain('Second criterion is satisfied');
    expect(result[4].instruction).toContain('Third criterion is satisfied');
  });

  it('always ends with a "validate" step', () => {
    const task = makeTask();
    const result = buildInstructions(task);
    const last = result[result.length - 1];
    expect(last.instruction).toContain('Validate all acceptance criteria');
  });

  it('ensures all instructions have minimum length of 10', () => {
    const task = makeTask();
    const result = buildInstructions(task);
    for (const step of result) {
      expect(step.instruction.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('produces correct count: 2 + criteria + 1 = total', () => {
    const nCriteria = 4;
    const task = makeTask({
      acceptanceCriteria: Array.from({ length: nCriteria }, (_, i) => ({
        description: `Acceptance criterion number ${i + 1} is met properly`,
        testable: true,
      })),
    });
    const result = buildInstructions(task);
    // 1 understand + 1 create/modify + nCriteria + 1 validate
    expect(result).toHaveLength(2 + nCriteria + 1);
  });
});

/* ================================================================== */
/*  deriveTickets                                                      */
/* ================================================================== */

describe('deriveTickets', () => {
  it('produces one ticket per task', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);
    expect(tickets).toHaveLength(3);
  });

  it('maps frontmatter fields correctly', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    // TASK-001: architecture, priority 1, 8000 tokens
    const t1 = tickets[0];
    expect(t1.frontmatter.id).toBe('TASK-001');
    expect(t1.frontmatter.title).toBe('Define database schema');
    expect(t1.frontmatter.type).toBe('architecture');
    expect(t1.frontmatter.priority).toBe('critical'); // priority 1
    expect(t1.frontmatter.estimate).toBe('1d'); // 8000 tokens (5000-20000 range)
    expect(t1.frontmatter.dependencies).toEqual([]);
    expect(t1.frontmatter.labels).toEqual(['database', 'schema']);
    expect(t1.frontmatter.assignee).toBe('unassigned');
    expect(t1.frontmatter.status).toBe('backlog');
  });

  it('maps dependencies correctly', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    expect(tickets[1].frontmatter.dependencies).toEqual(['TASK-001']);
    expect(tickets[2].frontmatter.dependencies).toEqual(['TASK-001', 'TASK-002']);
  });

  it('generates body with description, acceptanceCriteria, technicalNotes', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    const t1 = tickets[0];
    expect(t1.body.description.length).toBeGreaterThanOrEqual(20);
    expect(t1.body.acceptanceCriteria).toHaveLength(2); // TASK-001 has 2 criteria
    expect(t1.body.technicalNotes).toBeDefined();
    expect(t1.body.technicalNotes!.length).toBeGreaterThanOrEqual(10);
    expect(t1.body.relatedDecisions).toEqual([]);
  });

  it('generates acceptance criteria in given/when/then format', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);
    const ac = tickets[0].body.acceptanceCriteria[0];

    expect(ac).toHaveProperty('given');
    expect(ac).toHaveProperty('when');
    expect(ac).toHaveProperty('then');
    expect(ac.given.length).toBeGreaterThanOrEqual(5);
    expect(ac.when.length).toBeGreaterThanOrEqual(5);
    expect(ac.then.length).toBeGreaterThanOrEqual(5);
  });

  it('includes filesWrite in technicalNotes', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);
    const t1 = tickets[0];
    expect(t1.body.technicalNotes).toContain('src/db/schema.ts');
    expect(t1.body.technicalNotes).toContain('src/db/migrations/001.sql');
  });

  it('maps different task types to correct ticket types', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    expect(tickets[0].frontmatter.type).toBe('architecture'); // architecture -> architecture
    expect(tickets[1].frontmatter.type).toBe('feature');       // feature -> feature
    expect(tickets[2].frontmatter.type).toBe('testing');       // testing -> testing
  });

  it('maps different priorities to correct ticket priorities', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    expect(tickets[0].frontmatter.priority).toBe('critical'); // priority 1
    expect(tickets[1].frontmatter.priority).toBe('high');     // priority 2
    expect(tickets[2].frontmatter.priority).toBe('medium');   // priority 3
  });

  it('maps different token counts to correct estimates', () => {
    const input = makeMultiTaskInput();
    const tickets = deriveTickets(input);

    expect(tickets[0].frontmatter.estimate).toBe('1d');  // 8000 tokens
    expect(tickets[1].frontmatter.estimate).toBe('3d');  // 25000 tokens
    expect(tickets[2].frontmatter.estimate).toBe('4h');  // 4000 tokens
  });

  it('handles a single task', () => {
    const input = makeTaskGraphInput([makeTask()]);
    const tickets = deriveTickets(input);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].frontmatter.id).toBe('TASK-001');
  });

  it('handles task with undefined estimatedTokens', () => {
    const input = makeTaskGraphInput([
      makeTask({ estimatedTokens: undefined }),
    ]);
    const tickets = deriveTickets(input);
    expect(tickets[0].frontmatter.estimate).toBe('4h');
  });

  it('handles task with empty tags', () => {
    const input = makeTaskGraphInput([
      makeTask({ tags: [] }),
    ]);
    const tickets = deriveTickets(input);
    expect(tickets[0].frontmatter.labels).toEqual([]);
  });
});

/* ================================================================== */
/*  derivePromptPacks                                                  */
/* ================================================================== */

describe('derivePromptPacks', () => {
  it('produces one prompt pack per task', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);
    expect(packs).toHaveLength(3);
  });

  it('sets taskId and taskName from the task', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    expect(packs[0].taskId).toBe('TASK-001');
    expect(packs[0].taskName).toBe('Define database schema');
    expect(packs[1].taskId).toBe('TASK-002');
    expect(packs[1].taskName).toBe('Implement data access layer');
  });

  it('builds context with minimum 20 characters', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    for (const pack of packs) {
      expect(pack.context.length).toBeGreaterThanOrEqual(20);
      expect(pack.context).toContain('Task:');
      expect(pack.context).toContain('Description:');
    }
  });

  it('builds outputFiles from task.filesWrite', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001 writes 2 files
    expect(packs[0].contract.outputFiles).toHaveLength(2);
    expect(packs[0].contract.outputFiles[0].filePath).toBe('src/db/schema.ts');
    expect(packs[0].contract.outputFiles[1].filePath).toBe('src/db/migrations/001.sql');

    for (const of_ of packs[0].contract.outputFiles) {
      expect(of_.exports).toEqual([]);
      expect(of_.description.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('builds inputFiles by cross-referencing filesRead with other tasks filesWrite', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001 has no filesRead -> no inputFiles
    expect(packs[0].inputFiles).toHaveLength(0);

    // TASK-002 reads src/db/schema.ts (written by TASK-001)
    expect(packs[1].inputFiles).toHaveLength(1);
    expect(packs[1].inputFiles[0].filePath).toBe('src/db/schema.ts');
    expect(packs[1].inputFiles[0].sourceTask).toBe('TASK-001');

    // TASK-003 reads schema.ts (TASK-001) and repository.ts (TASK-002)
    expect(packs[2].inputFiles).toHaveLength(2);
  });

  it('builds sequential instructions', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    for (const pack of packs) {
      expect(pack.instructions.length).toBeGreaterThanOrEqual(3); // at least understand + files + validate
      for (let i = 0; i < pack.instructions.length; i++) {
        expect(pack.instructions[i].step).toBe(i + 1);
        expect(pack.instructions[i].instruction.length).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('builds constraints including agent type and task type', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001: architect, architecture, tags: ['database', 'schema']
    const p1 = packs[0];
    expect(p1.constraints.length).toBeGreaterThanOrEqual(2);
    expect(p1.constraints).toContainEqual(expect.stringContaining('Agent type: architect'));
    expect(p1.constraints).toContainEqual(expect.stringContaining('Task type: architecture'));
    // Tags become additional constraints
    expect(p1.constraints).toContainEqual(expect.stringContaining('Tag: database'));
    expect(p1.constraints).toContainEqual(expect.stringContaining('Tag: schema'));
  });

  it('builds constraints with minimum 5 chars each', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    for (const pack of packs) {
      for (const constraint of pack.constraints) {
        expect(constraint.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('builds testCriteria from acceptance criteria descriptions', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001 has 2 acceptance criteria
    expect(packs[0].testCriteria).toHaveLength(2);
    for (const tc of packs[0].testCriteria) {
      expect(tc.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('maps estimatedComplexity from tokens', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001: 8000 tokens -> low (5000-15000)
    expect(packs[0].estimatedComplexity).toBe('low');
    // TASK-002: 25000 tokens -> medium (15000-30000)
    expect(packs[1].estimatedComplexity).toBe('medium');
    // TASK-003: 4000 tokens -> trivial (<5000)
    expect(packs[2].estimatedComplexity).toBe('trivial');
  });

  it('maps suggestedModel from priority', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001: priority 1 -> powerful
    expect(packs[0].suggestedModel).toBe('powerful');
    // TASK-002: priority 2 -> powerful
    expect(packs[1].suggestedModel).toBe('powerful');
    // TASK-003: priority 3 -> balanced
    expect(packs[2].suggestedModel).toBe('balanced');
  });

  it('builds previousTaskOutputs from dependencies', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    // TASK-001 has no dependencies -> no previousTaskOutputs
    expect(packs[0].previousTaskOutputs).toHaveLength(0);

    // TASK-002 depends on TASK-001 (which writes 2 files)
    expect(packs[1].previousTaskOutputs).toHaveLength(2);
    for (const pto of packs[1].previousTaskOutputs) {
      expect(pto.taskId).toBe('TASK-001');
      expect(pto.mode).toBe('reference');
      expect(pto.injectionPoint.length).toBeGreaterThanOrEqual(1);
    }
    const ptoPaths1 = packs[1].previousTaskOutputs.map((p) => p.filePath);
    expect(ptoPaths1).toContain('src/db/schema.ts');
    expect(ptoPaths1).toContain('src/db/migrations/001.sql');

    // TASK-003 depends on TASK-001 (2 files) and TASK-002 (1 file) -> 3 total
    expect(packs[2].previousTaskOutputs).toHaveLength(3);
    const taskIds = packs[2].previousTaskOutputs.map((p) => p.taskId);
    expect(taskIds).toContain('TASK-001');
    expect(taskIds).toContain('TASK-002');
  });

  it('sets contract.exports and contract.dependencies to empty arrays', () => {
    const input = makeMultiTaskInput();
    const packs = derivePromptPacks(input);

    for (const pack of packs) {
      expect(pack.contract.exports).toEqual([]);
      expect(pack.contract.dependencies).toEqual([]);
    }
  });

  it('handles a single task with no dependencies', () => {
    const input = makeTaskGraphInput([makeTask()]);
    const packs = derivePromptPacks(input);

    expect(packs).toHaveLength(1);
    expect(packs[0].taskId).toBe('TASK-001');
    expect(packs[0].previousTaskOutputs).toEqual([]);
    expect(packs[0].inputFiles).toEqual([]);
  });

  it('handles task with undefined estimatedTokens', () => {
    const input = makeTaskGraphInput([
      makeTask({ estimatedTokens: undefined }),
    ]);
    const packs = derivePromptPacks(input);

    expect(packs[0].estimatedComplexity).toBe('trivial');
  });

  it('handles task with empty tags (constraints still include agent + type)', () => {
    const input = makeTaskGraphInput([
      makeTask({ tags: [] }),
    ]);
    const packs = derivePromptPacks(input);

    // At least 2 constraints: agent type + task type
    expect(packs[0].constraints).toHaveLength(2);
  });

  it('does not self-reference in previousTaskOutputs even if dependsOn contains own id', () => {
    // Although normally invalid, the code guards against it via `depTask.id !== task.id`
    const tasks = [
      makeTask({
        id: 'TASK-001',
        dependsOn: ['TASK-001'] as unknown as string[],
        filesWrite: ['src/a.ts'],
      }),
    ];
    const input = makeTaskGraphInput(tasks);
    const packs = derivePromptPacks(input);

    // The self-reference should be excluded
    expect(packs[0].previousTaskOutputs).toHaveLength(0);
  });

  it('skips previousTaskOutputs for dependency IDs not found in allTasks', () => {
    const tasks = [
      makeTask({
        id: 'TASK-001',
        dependsOn: ['TASK-999'],
        filesWrite: ['src/a.ts'],
      }),
    ];
    const input = makeTaskGraphInput(tasks);
    const packs = derivePromptPacks(input);

    // TASK-999 doesn't exist in the task list, so no outputs
    expect(packs[0].previousTaskOutputs).toHaveLength(0);
  });
});
