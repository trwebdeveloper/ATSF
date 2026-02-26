/**
 * JSON Reporter — T12
 *
 * JSON output for CI/CD pipelines (Section 7.5).
 */

import type { GateReport, GateReporter } from '../types.js';

export const jsonReporter: GateReporter = {
  format: 'json',

  render(report: GateReport): string {
    return JSON.stringify({
      timestamp: report.timestamp.toISOString(),
      duration: report.duration,
      overallScore: report.overallScore,
      passed: report.passed,
      fixesApplied: report.fixesApplied,
      fixRoundsUsed: report.fixRoundsUsed,
      gates: report.gates.map(gate => ({
        gateId: gate.gateId,
        score: gate.score,
        passed: gate.passed,
        durationMs: gate.durationMs,
        findingsCount: gate.findings.length,
        findings: gate.findings.map(f => ({
          ruleId: f.ruleId,
          severity: f.severity,
          message: f.message,
          location: f.location,
          fixable: f.fixable,
        })),
        fixesCount: gate.fixes.length,
      })),
    }, null, 2);
  },
};
