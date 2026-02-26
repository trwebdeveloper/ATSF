/**
 * JUnit Reporter — T12
 *
 * JUnit XML output for test runner integration (Section 7.5).
 */

import type { GateReport, GateReporter } from '../types.js';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const junitReporter: GateReporter = {
  format: 'junit',

  render(report: GateReport): string {
    const lines: string[] = [];

    const totalTests = report.gates.length;
    const failures = report.gates.filter(g => !g.passed).length;
    const totalTime = (report.duration / 1000).toFixed(3);

    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<testsuites tests="${totalTests}" failures="${failures}" time="${totalTime}" timestamp="${report.timestamp.toISOString()}">`,
    );

    for (const gate of report.gates) {
      const gateTime = (gate.durationMs / 1000).toFixed(3);
      const errorFindings = gate.findings.filter(f => f.severity === 'error');

      lines.push(
        `  <testsuite name="${escapeXml(gate.gateId)}" tests="1" failures="${gate.passed ? 0 : 1}" time="${gateTime}">`,
      );
      lines.push(
        `    <testcase name="${escapeXml(gate.gateId)}" classname="quality-gates" time="${gateTime}">`,
      );

      if (!gate.passed) {
        const failureMessages = errorFindings
          .map(f => `[${f.ruleId}] ${f.message}`)
          .join('\n');

        lines.push(
          `      <failure message="${escapeXml(`Gate ${gate.gateId} failed with score ${(gate.score * 100).toFixed(1)}%`)}" type="GateFailure">`,
        );
        lines.push(escapeXml(failureMessages || 'Gate did not meet threshold'));
        lines.push('      </failure>');
      }

      lines.push('    </testcase>');
      lines.push('  </testsuite>');
    }

    lines.push('</testsuites>');

    return lines.join('\n');
  },
};
