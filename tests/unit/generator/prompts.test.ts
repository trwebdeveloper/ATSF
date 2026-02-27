import { describe, it, expect } from 'vitest';
import {
  TASK_GRAPH_SYSTEM_PROMPT,
  REPO_BLUEPRINT_SYSTEM_PROMPT,
  MPD_SYSTEM_PROMPT,
  buildTaskGraphPrompt,
  buildRepoBlueprintPrompt,
  buildMpdPrompt,
  buildSystemPrompt,
} from '../../../src/generator/prompts.js';

/* ------------------------------------------------------------------ */
/*  1. System prompts are non-empty strings                            */
/* ------------------------------------------------------------------ */
describe('System prompt constants', () => {
  it('TASK_GRAPH_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof TASK_GRAPH_SYSTEM_PROMPT).toBe('string');
    expect(TASK_GRAPH_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('REPO_BLUEPRINT_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof REPO_BLUEPRINT_SYSTEM_PROMPT).toBe('string');
    expect(REPO_BLUEPRINT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('MPD_SYSTEM_PROMPT is a non-empty string', () => {
    expect(typeof MPD_SYSTEM_PROMPT).toBe('string');
    expect(MPD_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  2. buildTaskGraphPrompt                                            */
/* ------------------------------------------------------------------ */
describe('buildTaskGraphPrompt', () => {
  const description = 'A web app that manages todo items with REST API';
  const projectName = 'TodoApp';

  it('includes the description in the output', () => {
    const result = buildTaskGraphPrompt(description, projectName);
    expect(result).toContain(description);
  });

  it('includes the projectName in the output', () => {
    const result = buildTaskGraphPrompt(description, projectName);
    expect(result).toContain(projectName);
  });

  it('returns a non-empty string', () => {
    const result = buildTaskGraphPrompt(description, projectName);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes instructions about task decomposition', () => {
    const result = buildTaskGraphPrompt(description, projectName);
    expect(result).toContain('task graph');
  });
});

/* ------------------------------------------------------------------ */
/*  3. buildRepoBlueprintPrompt                                        */
/* ------------------------------------------------------------------ */
describe('buildRepoBlueprintPrompt', () => {
  const description = 'E-commerce platform with payment processing';
  const tasksSummary = 'TASK-001: Set up project scaffold\nTASK-002: Implement auth';

  it('includes the description in the output', () => {
    const result = buildRepoBlueprintPrompt(description, tasksSummary);
    expect(result).toContain(description);
  });

  it('includes the tasksSummary in the output', () => {
    const result = buildRepoBlueprintPrompt(description, tasksSummary);
    expect(result).toContain(tasksSummary);
  });

  it('returns a non-empty string', () => {
    const result = buildRepoBlueprintPrompt(description, tasksSummary);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes instructions about repository structure', () => {
    const result = buildRepoBlueprintPrompt(description, tasksSummary);
    expect(result).toContain('repository file structure');
  });
});

/* ------------------------------------------------------------------ */
/*  4. buildMpdPrompt — different content per section                   */
/* ------------------------------------------------------------------ */
describe('buildMpdPrompt', () => {
  const description = 'Real-time chat application with WebSocket support';
  const tasksSummary = 'TASK-001: Project init\nTASK-002: WebSocket server';

  it('includes description and tasksSummary in all sections', () => {
    for (const section of ['core', 'design', 'plan'] as const) {
      const result = buildMpdPrompt(description, tasksSummary, section);
      expect(result).toContain(description);
      expect(result).toContain(tasksSummary);
    }
  });

  it('returns different content for core, design, and plan sections', () => {
    const core = buildMpdPrompt(description, tasksSummary, 'core');
    const design = buildMpdPrompt(description, tasksSummary, 'design');
    const plan = buildMpdPrompt(description, tasksSummary, 'plan');

    expect(core).not.toBe(design);
    expect(core).not.toBe(plan);
    expect(design).not.toBe(plan);
  });

  it('core section mentions Executive Summary and Technical Architecture', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'core');
    expect(result).toContain('Executive Summary');
    expect(result).toContain('Technical Architecture');
  });

  it('design section mentions Data Model and API Design', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'design');
    expect(result).toContain('Data Model');
    expect(result).toContain('API Design');
  });

  it('plan section mentions Deployment Plan and Risk Assessment', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'plan');
    expect(result).toContain('Deployment Plan');
    expect(result).toContain('Risk Assessment');
  });

  it('core section mentions Component Design', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'core');
    expect(result).toContain('Component Design');
  });

  it('design section mentions Security Considerations and Testing Strategy', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'design');
    expect(result).toContain('Security Considerations');
    expect(result).toContain('Testing Strategy');
  });

  it('plan section mentions Timeline, Glossary, and Appendices', () => {
    const result = buildMpdPrompt(description, tasksSummary, 'plan');
    expect(result).toContain('Timeline');
    expect(result).toContain('Glossary');
    expect(result).toContain('Appendices');
  });
});

/* ------------------------------------------------------------------ */
/*  5. buildSystemPrompt with lang='en'                                */
/* ------------------------------------------------------------------ */
describe('buildSystemPrompt with lang="en"', () => {
  it('returns the base prompt unchanged when lang is en', () => {
    const base = 'You are a helpful assistant.';
    const result = buildSystemPrompt(base, 'en');
    expect(result).toBe(base);
  });

  it('does not prepend any directive for English', () => {
    const base = TASK_GRAPH_SYSTEM_PROMPT;
    const result = buildSystemPrompt(base, 'en');
    expect(result).toBe(base);
    expect(result).not.toContain('IMPORTANT: Generate ALL output content in');
  });
});

/* ------------------------------------------------------------------ */
/*  6. buildSystemPrompt with lang='tr'                                */
/* ------------------------------------------------------------------ */
describe('buildSystemPrompt with lang="tr"', () => {
  it('includes a Turkish language directive', () => {
    const base = 'You are a helpful assistant.';
    const result = buildSystemPrompt(base, 'tr');
    expect(result).toContain('Turkish');
    expect(result).toContain('IMPORTANT');
  });

  it('prepends the directive before the base prompt', () => {
    const base = 'You are a helpful assistant.';
    const result = buildSystemPrompt(base, 'tr');
    expect(result).toContain(base);
    expect(result.indexOf('IMPORTANT')).toBeLessThan(result.indexOf(base));
  });

  it('includes the full language directive sentence', () => {
    const base = 'Some prompt text.';
    const result = buildSystemPrompt(base, 'tr');
    expect(result).toContain(
      'IMPORTANT: Generate ALL output content in Turkish',
    );
  });

  it('result is longer than the base prompt', () => {
    const base = 'Short prompt.';
    const result = buildSystemPrompt(base, 'tr');
    expect(result.length).toBeGreaterThan(base.length);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge: buildSystemPrompt with unknown language                      */
/* ------------------------------------------------------------------ */
describe('buildSystemPrompt with unknown language', () => {
  it('prepends a directive using the raw lang code for unknown languages', () => {
    const base = 'You are a helpful assistant.';
    const result = buildSystemPrompt(base, 'fr');
    expect(result).toContain('IMPORTANT: Generate ALL output content in fr');
    expect(result).toContain(base);
  });
});
