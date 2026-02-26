/**
 * Console Reporter — T12
 *
 * Colorized console output for gate results (Section 7.5).
 */

import type { GateReport, GateReporter } from '../types.js';

function statusIcon(passed: boolean): string {
  return passed ? 'PASS' : 'FAIL';
}

function severityLabel(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error': return 'ERROR';
    case 'warning': return 'WARN';
    case 'info': return 'INFO';
  }
}

export const consoleReporter: GateReporter = {
  format: 'console',

  render(report: GateReport): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('=== Quality Gate Report ===');
    lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
    lines.push(`Duration: ${report.duration.toFixed(0)}ms`);
    lines.push('');

    for (const gate of report.gates) {
      const icon = statusIcon(gate.passed);
      lines.push(`[${icon}] ${gate.gateId} (score: ${(gate.score * 100).toFixed(1)}%, ${gate.durationMs.toFixed(0)}ms)`);

      for (const finding of gate.findings) {
        lines.push(`  [${severityLabel(finding.severity)}] ${finding.ruleId}: ${finding.message}`);
      }

      if (gate.findings.length === 0) {
        lines.push('  No findings');
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`Overall Score: ${(report.overallScore * 100).toFixed(1)}%`);
    lines.push(`Status: ${report.passed ? 'PASSED' : 'FAILED'}`);

    if (report.fixesApplied > 0) {
      lines.push(`Fixes Applied: ${report.fixesApplied} (${report.fixRoundsUsed} rounds)`);
    }

    lines.push('');
    return lines.join('\n');
  },
};
