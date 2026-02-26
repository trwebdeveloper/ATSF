/**
 * Markdown Reporter — T12
 *
 * Markdown output for documentation (Section 7.5).
 */

import type { GateReport, GateReporter } from '../types.js';

export const markdownReporter: GateReporter = {
  format: 'markdown',

  render(report: GateReport): string {
    const lines: string[] = [];

    lines.push('# Quality Gate Report');
    lines.push('');
    lines.push(`**Timestamp:** ${report.timestamp.toISOString()}`);
    lines.push(`**Duration:** ${report.duration.toFixed(0)}ms`);
    lines.push(`**Overall Score:** ${(report.overallScore * 100).toFixed(1)}%`);
    lines.push(`**Status:** ${report.passed ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    if (report.fixesApplied > 0) {
      lines.push(`**Fixes Applied:** ${report.fixesApplied} (${report.fixRoundsUsed} rounds)`);
      lines.push('');
    }

    lines.push('## Gate Results');
    lines.push('');
    lines.push('| Gate | Score | Status | Findings | Duration |');
    lines.push('|------|-------|--------|----------|----------|');

    for (const gate of report.gates) {
      const status = gate.passed ? 'PASS' : 'FAIL';
      lines.push(
        `| ${gate.gateId} | ${(gate.score * 100).toFixed(1)}% | ${status} | ${gate.findings.length} | ${gate.durationMs.toFixed(0)}ms |`,
      );
    }

    lines.push('');

    // Detailed findings per gate
    for (const gate of report.gates) {
      if (gate.findings.length === 0) continue;

      lines.push(`### ${gate.gateId}`);
      lines.push('');

      for (const finding of gate.findings) {
        const fixIcon = finding.fixable ? ' (fixable)' : '';
        lines.push(`- **[${finding.severity.toUpperCase()}]** \`${finding.ruleId}\`: ${finding.message}${fixIcon}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  },
};
