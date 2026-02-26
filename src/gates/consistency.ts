/**
 * Consistency Gate — T12
 *
 * Cross-reference integrity checking (Section 7.3.2).
 * Score: 1.0 - (errorFindings / totalCrossReferences)
 */

import type { GatePlugin, GateContext, GateResult, GateFinding, GateFix } from './types.js';

export const consistencyGate: GatePlugin = {
  id: 'consistency',
  name: 'Consistency Gate',
  version: '1.0.0',
  priority: 2,
  fixable: true,

  async run(context: GateContext): Promise<GateResult> {
    const start = performance.now();

    if (context.signal.aborted) {
      return {
        gateId: 'consistency',
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    const findings: GateFinding[] = [];
    const fixes: GateFix[] = [];

    // Use the cross-reference validator (L3 validation)
    const crossRefResult = context.validateCrossReferences(context.artifacts);

    // Convert cross-ref violations to gate findings
    for (const violation of crossRefResult.errors) {
      findings.push({
        ruleId: violation.ruleId,
        severity: 'error',
        message: violation.message,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['cross-ref', violation.ruleId],
        },
        fixable: true,
      });

      // Generate fix for naming inconsistencies / missing cross-references
      fixes.push({
        gateId: 'consistency',
        ruleId: violation.ruleId,
        severity: 'error',
        description: `Fix cross-reference: ${violation.message}`,
        location: {
          file: 'task_graph.yaml',
          path: ['cross-ref', violation.ruleId],
        },
        fix: {
          type: 'replace',
          target: violation.ruleId,
          value: violation.offendingValues,
        },
      });
    }

    for (const violation of crossRefResult.warnings) {
      findings.push({
        ruleId: violation.ruleId,
        severity: 'warning',
        message: violation.message,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['cross-ref', violation.ruleId],
        },
        fixable: false,
      });
    }

    // Check task dependency references exist
    const taskIds = new Set(context.artifacts.taskGraph.tasks.map(t => t.id));
    for (const task of context.artifacts.taskGraph.tasks) {
      for (const dep of task.dependsOn) {
        if (!taskIds.has(dep)) {
          findings.push({
            ruleId: 'consistency-dep-missing',
            severity: 'error',
            message: `Task "${task.id}" depends on non-existent task "${dep}"`,
            location: {
              artifact: 'task_graph',
              file: 'task_graph.yaml',
              path: ['tasks', task.id, 'dependsOn'],
            },
            fixable: true,
          });
        }
      }
    }

    // Count total cross-reference checks and error findings for score
    // Each XREF rule (001-013) is one check
    const totalCrossReferences = 13 + context.artifacts.taskGraph.tasks.reduce(
      (acc, t) => acc + t.dependsOn.length, 0,
    );
    const errorFindings = findings.filter(f => f.severity === 'error').length;

    const score = totalCrossReferences > 0
      ? Math.max(0, 1.0 - (errorFindings / totalCrossReferences))
      : 1.0;
    const threshold = context.config.gates['consistency']?.threshold ?? context.config.threshold;
    const passed = score >= threshold;

    return {
      gateId: 'consistency',
      score,
      passed,
      findings,
      fixes,
      durationMs: performance.now() - start,
    };
  },
};
