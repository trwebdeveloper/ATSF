/**
 * Testability Gate — T12
 *
 * Detects vague, untestable specifications using regex patterns (Section 7.3.3).
 * Score: 1.0 - (vagueStatements / totalStatements)
 */

import type { GatePlugin, GateContext, GateResult, GateFinding, GateFix } from './types.js';

/** Reference implementation from spec Section 7.3.3 */
export const VAGUE_PATTERNS: RegExp[] = [
  /\bshould\s+(?:be\s+)?(?:fast|efficient|scalable|robust|reliable)\b/i,
  /\bif\s+(?:needed|necessary|appropriate|possible)\b/i,
  /\betc\.?\b/i,
  /\band\s+(?:so\s+on|more)\b/i,
  /\b(?:various|several|some|many)\s+\w+s?\b/i,
];

/**
 * Scan a text statement for vague patterns.
 * Returns the list of matching pattern descriptions.
 */
export function findVaguePatterns(text: string): string[] {
  const matches: string[] = [];
  for (const pattern of VAGUE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }
  return matches;
}

/**
 * Collect all scannable statements from artifacts:
 * task descriptions, acceptance criteria, and test descriptions.
 */
function collectStatements(
  context: GateContext,
): Array<{ text: string; taskId: string; field: string }> {
  const statements: Array<{ text: string; taskId: string; field: string }> = [];

  for (const task of context.artifacts.taskGraph.tasks) {
    // Task description
    statements.push({
      text: task.description,
      taskId: task.id,
      field: 'description',
    });

    // Acceptance criteria
    for (let i = 0; i < task.acceptanceCriteria.length; i++) {
      statements.push({
        text: task.acceptanceCriteria[i].description,
        taskId: task.id,
        field: `acceptanceCriteria[${i}]`,
      });
    }
  }

  // Ticket descriptions and acceptance criteria
  for (const ticket of context.artifacts.tickets) {
    statements.push({
      text: ticket.body.description,
      taskId: ticket.frontmatter.id,
      field: 'ticket.description',
    });
  }

  // Prompt pack test criteria
  for (const pack of context.artifacts.promptPacks) {
    for (let i = 0; i < pack.testCriteria.length; i++) {
      statements.push({
        text: pack.testCriteria[i],
        taskId: pack.taskId,
        field: `testCriteria[${i}]`,
      });
    }
  }

  return statements;
}

export const testabilityGate: GatePlugin = {
  id: 'testability',
  name: 'Testability Gate',
  version: '1.0.0',
  priority: 4,
  fixable: true,

  async run(context: GateContext): Promise<GateResult> {
    const start = performance.now();

    if (context.signal.aborted) {
      return {
        gateId: 'testability',
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    const findings: GateFinding[] = [];
    const fixes: GateFix[] = [];
    const statements = collectStatements(context);
    let vagueCount = 0;

    for (const stmt of statements) {
      const vagueMatches = findVaguePatterns(stmt.text);
      if (vagueMatches.length > 0) {
        vagueCount++;
        findings.push({
          ruleId: 'testability-vague',
          severity: 'warning',
          message: `Vague statement in ${stmt.taskId}.${stmt.field}: "${vagueMatches.join('", "')}"`,
          location: {
            artifact: 'task_graph',
            file: 'task_graph.yaml',
            path: ['tasks', stmt.taskId, stmt.field],
          },
          fixable: true,
        });

        fixes.push({
          gateId: 'testability',
          ruleId: 'testability-vague',
          severity: 'warning',
          description: `Convert vague statement to BDD Given/When/Then criteria`,
          location: {
            file: 'task_graph.yaml',
            path: ['tasks', stmt.taskId, stmt.field],
          },
          fix: {
            type: 'replace',
            target: stmt.field,
            value: `Given [precondition], When [action], Then [expected result]`,
          },
        });
      }
    }

    const totalStatements = statements.length;
    const score = totalStatements > 0
      ? Math.max(0, 1.0 - (vagueCount / totalStatements))
      : 1.0;
    const threshold = context.config.gates['testability']?.threshold ?? context.config.threshold;
    const passed = score >= threshold;

    return {
      gateId: 'testability',
      score,
      passed,
      findings,
      fixes,
      durationMs: performance.now() - start,
    };
  },
};
