/**
 * Generator prompts — system prompts and user prompt builders for LLM artifact generation.
 */

import { withLangDirective } from '../emitter/i18n.js';

/* ------------------------------------------------------------------ */
/*  System prompts                                                     */
/* ------------------------------------------------------------------ */

/**
 * System prompt for task graph generation.
 * Instructs the LLM to decompose a project into a dependency-ordered task graph.
 */
export const TASK_GRAPH_SYSTEM_PROMPT = `You are a senior software architect and project decomposition specialist.

Your job is to analyze a project description and produce a structured task graph that breaks the project into implementable tasks.

## Rules

1. **Task IDs**: Use the format TASK-NNN with zero-padded 3-digit numbers starting from TASK-001.
2. **File paths**: All file paths must be POSIX-style (forward slashes), relative to the project root (no leading slash), and lowercase where appropriate.
3. **No cycles**: The dependency graph must be a DAG — no circular dependencies allowed.
4. **Every task must write at least one file** (filesWrite must have at least 1 entry).
5. **Dependencies**: Each task's dependsOn array must only reference task IDs that exist in the graph.
6. **Agent types**: Assign one of: planner, architect, critic, judge, builder, reviewer, documenter, integrator.
7. **Task types**: Use one of: feature, architecture, testing, documentation, review, infrastructure, security, refactoring.
8. **Priority**: Integer from 1 (highest) to 5 (lowest).
9. **Acceptance criteria**: Each task must have at least one acceptance criterion with a description (min 10 chars) and testable boolean.
10. **Tags**: Optional string labels for categorization.
11. **Estimated tokens**: Optional integer (100–500000) estimating implementation complexity.

## Project Metadata

Include project-level metadata:
- name: The project name
- description: A clear summary (10–5000 chars)
- techStack: Array of {name, version?, purpose} for key technologies
- constraints: Array of project-level constraints (each min 5 chars)

## Output Quality

- Order tasks so that dependencies come before dependents.
- Ensure tasks are granular enough to be independently implementable.
- Include filesRead for files the task needs as input from other tasks.
- Use descriptive task names (3–120 chars) and thorough descriptions (10–2000 chars).`;

/**
 * System prompt for repository blueprint generation.
 * Instructs the LLM to design a file/directory tree structure.
 */
export const REPO_BLUEPRINT_SYSTEM_PROMPT = `You are a software architect designing a repository file structure.

Your job is to produce a hierarchical tree of directories and files that represents the ideal project layout.

## Rules

1. **Node types**: Each node is either "dir" (directory) or "file".
2. **Directories** have children (an array of child nodes) but NO language field.
3. **Files** have a language field (e.g., "typescript", "yaml", "json", "markdown") but NO children.
4. **Names**: Each node has a name (1–255 chars) and a purpose description (1–500 chars).
5. **generatedBy**: Optionally reference a TASK-NNN that creates the file.
6. **dependencies**: Optional array of file dependency strings.
7. **POSIX paths**: Use forward slashes for path separators, no leading slashes.

## Structure Guidelines

- Start with root-level config files (package.json, tsconfig.json, etc.).
- Group source code under src/ with logical subdirectories.
- Include test directories that mirror source structure.
- Include CI/CD configuration, documentation folders, and build scripts as appropriate.
- Keep the tree practical — include files that the tasks will actually create.`;

/**
 * System prompt for Master Planning Document (MPD) generation.
 * Instructs the LLM to produce detailed planning sections.
 */
export const MPD_SYSTEM_PROMPT = `You are a senior technical writer and project planner.

Your job is to generate structured sections of a Master Planning Document (MPD) for a software project.

## Formatting Rules

1. **Task references**: Use TASK-NNN format when referencing tasks from the task graph.
2. **Diagrams**: Provide Mermaid diagram source code with a type (flowchart, sequenceDiagram, erDiagram, classDiagram, stateDiagram, gantt, graph) and title.
3. **Assumptions**: Use ASMP-NNN format for assumption IDs.
4. **Risks**: Use RISK-NNN format for risk IDs.
5. **ADRs**: Use ADR-NNN format for architectural decision record references.

## Quality Standards

- All text fields must meet minimum length requirements specified in the schema.
- Provide actionable, specific content — not generic filler text.
- Cross-reference tasks, risks, and assumptions where appropriate.
- Diagrams should accurately represent the described architecture.
- Security considerations should address real threats relevant to the project.
- Testing strategy should include concrete tools and coverage targets.`;

/* ------------------------------------------------------------------ */
/*  User prompt builders                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a user prompt for task graph generation.
 */
export function buildTaskGraphPrompt(description: string, projectName: string): string {
  return `## Project: ${projectName}

## Description

${description}

---

Decompose this project into a structured task graph. Produce:
- Project metadata (name, description, tech stack, constraints)
- An ordered array of tasks with IDs, dependencies, file paths, agents, types, priorities, and acceptance criteria

Ensure the dependency graph is a valid DAG with no cycles. Every task must write at least one file.`;
}

/**
 * Build a user prompt for repository blueprint generation.
 */
export function buildRepoBlueprintPrompt(description: string, tasksSummary: string): string {
  return `## Project Description

${description}

## Tasks Summary

${tasksSummary}

---

Design the complete repository file structure for this project. Include:
- All directories and files that the tasks above will create
- Configuration files, build scripts, and CI/CD setup
- Test directories mirroring the source structure
- Documentation folders

Output a hierarchical tree with directories containing children and files having language annotations.`;
}

/**
 * Build a user prompt for MPD section generation.
 * The MPD is split into 3 sections to stay within context limits.
 */
export function buildMpdPrompt(
  description: string,
  tasksSummary: string,
  section: 'core' | 'design' | 'plan',
): string {
  const sectionInstructions: Record<string, string> = {
    core: `Generate the CORE sections of the Master Planning Document:

1. **Executive Summary**: Project name, one-liner, objectives, target audience, and scope (in-scope / out-of-scope).
2. **Project Overview**: Background, problem statement, proposed solution, success criteria, and assumptions (ASMP-NNN).
3. **Technical Architecture**: Architecture overview, Mermaid diagrams, design patterns with ADR references, and tech stack details.
4. **Component Design**: Components with descriptions, responsibilities, interfaces, dependencies, and task references (TASK-NNN).`,

    design: `Generate the DESIGN sections of the Master Planning Document:

1. **Data Model**: Overview, entities with fields and relationships, optional ER diagrams.
2. **API Design**: Overview, endpoints (method, path, description, task refs), authentication strategy.
3. **Security Considerations**: Overview and threat model (threat, severity, mitigation, task refs).
4. **Testing Strategy**: Overview, testing levels (unit, integration, e2e, performance, security) with tools and coverage targets, task refs.`,

    plan: `Generate the PLAN sections of the Master Planning Document:

1. **Deployment Plan**: Overview, environments (name, purpose, infrastructure), CI/CD pipeline description.
2. **Risk Assessment**: Risks with RISK-NNN IDs, descriptions, probability, impact, and mitigations.
3. **Timeline**: Phases with task refs, critical path (array of TASK-NNN IDs), optional Gantt diagram.
4. **Glossary**: Terms and definitions relevant to the project.
5. **Appendices**: ADRs (ADR-NNN, title, status, summary) and external references.`,
  };

  return `## Project Description

${description}

## Tasks Summary

${tasksSummary}

---

${sectionInstructions[section]}

Be specific and detailed. Reference actual tasks from the task graph using TASK-NNN format. All text must meet the minimum length requirements.`;
}

/* ------------------------------------------------------------------ */
/*  System prompt wrapper with language directive                       */
/* ------------------------------------------------------------------ */

/**
 * Wrap a base system prompt with a language directive if the configured language
 * is not English. Uses withLangDirective from the i18n module.
 */
export function buildSystemPrompt(base: string, lang: string): string {
  return withLangDirective(base, lang);
}
