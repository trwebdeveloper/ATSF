/**
 * Security Gate — T12
 *
 * Pattern-based detection for secrets and injection (Section 7.3.5).
 * Score: 1.0 - (weightedFindings / maxPossibleScore)
 * Severity weights: error=1.0, warning=0.3, info=0.0
 */

import type { GatePlugin, GateContext, GateResult, GateFinding, GateFix } from './types.js';

/** Secret detection patterns with severity and description. */
export const SECRET_PATTERNS: Array<{
  pattern: RegExp;
  ruleId: string;
  description: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    ruleId: 'secret-aws-key',
    description: 'AWS access key ID detected',
    severity: 'error',
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    ruleId: 'secret-jwt',
    description: 'JWT token detected',
    severity: 'error',
  },
  {
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@/i,
    ruleId: 'secret-connection-string',
    description: 'Database connection string with credentials detected',
    severity: 'error',
  },
  {
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{16,}['"]/i,
    ruleId: 'secret-api-key',
    description: 'API key or secret in plain text detected',
    severity: 'error',
  },
  {
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    ruleId: 'secret-private-key',
    description: 'Private key detected',
    severity: 'error',
  },
];

/** Shell injection patterns. */
export const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  ruleId: string;
  description: string;
  severity: 'error' | 'warning';
}> = [
  {
    pattern: /\$\([^)]+\)/,
    ruleId: 'injection-command-substitution',
    description: 'Shell command substitution detected',
    severity: 'warning',
  },
  {
    pattern: /`[^`]+`/,
    ruleId: 'injection-backtick',
    description: 'Backtick command execution detected',
    severity: 'warning',
  },
  {
    pattern: /;\s*(?:rm|curl|wget|eval|exec|chmod|chown)\b/i,
    ruleId: 'injection-dangerous-command',
    description: 'Potentially dangerous shell command in task definition',
    severity: 'error',
  },
];

/** Known-safe patterns for allowlisting. */
export const ALLOWLIST_PATTERNS: RegExp[] = [
  /\$\{[A-Z_]+\}/,              // environment variable references (e.g., ${API_KEY})
  /process\.env\.[A-Z_]+/,      // Node.js env access
  /\bplaceholder\b/i,           // placeholder values
  /\bexample\b/i,               // example values
  /\bTODO\b/i,                  // TODO markers
];

/**
 * Check if a text matches any allowlist pattern.
 */
function isAllowlisted(text: string): boolean {
  return ALLOWLIST_PATTERNS.some(p => p.test(text));
}

/**
 * Scan a text for security issues.
 */
function scanText(
  text: string,
  taskId: string,
  field: string,
): { findings: GateFinding[]; fixes: GateFix[] } {
  const findings: GateFinding[] = [];
  const fixes: GateFix[] = [];

  if (isAllowlisted(text)) return { findings, fixes };

  // Check secret patterns
  for (const { pattern, ruleId, description, severity } of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        ruleId,
        severity,
        message: `${description} in ${taskId}.${field}`,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['tasks', taskId, field],
        },
        fixable: true,
      });

      fixes.push({
        gateId: 'security',
        ruleId,
        severity,
        description: `Replace detected secret with environment variable reference`,
        location: {
          file: 'task_graph.yaml',
          path: ['tasks', taskId, field],
        },
        fix: {
          type: 'replace',
          target: field,
          value: text.replace(match[0], '${REDACTED_SECRET}'),
        },
      });
    }
  }

  // Check injection patterns
  for (const { pattern, ruleId, description, severity } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      findings.push({
        ruleId,
        severity,
        message: `${description} in ${taskId}.${field}`,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['tasks', taskId, field],
        },
        fixable: false,
      });
    }
  }

  return { findings, fixes };
}

export const securityGate: GatePlugin = {
  id: 'security',
  name: 'Security Gate',
  version: '1.0.0',
  priority: 0,
  fixable: true,

  async run(context: GateContext): Promise<GateResult> {
    const start = performance.now();

    if (context.signal.aborted) {
      return {
        gateId: 'security',
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    const findings: GateFinding[] = [];
    const fixes: GateFix[] = [];

    // Scan all task descriptions and acceptance criteria
    for (const task of context.artifacts.taskGraph.tasks) {
      const descResult = scanText(task.description, task.id, 'description');
      findings.push(...descResult.findings);
      fixes.push(...descResult.fixes);

      for (let i = 0; i < task.acceptanceCriteria.length; i++) {
        const acResult = scanText(
          task.acceptanceCriteria[i].description,
          task.id,
          `acceptanceCriteria[${i}]`,
        );
        findings.push(...acResult.findings);
        fixes.push(...acResult.fixes);
      }
    }

    // Scan ticket descriptions
    for (const ticket of context.artifacts.tickets) {
      const ticketResult = scanText(
        ticket.body.description,
        ticket.frontmatter.id,
        'ticket.description',
      );
      findings.push(...ticketResult.findings);
      fixes.push(...ticketResult.fixes);
    }

    // Scan prompt pack contexts and instructions
    for (const pack of context.artifacts.promptPacks) {
      const ctxResult = scanText(pack.context, pack.taskId, 'context');
      findings.push(...ctxResult.findings);
      fixes.push(...ctxResult.fixes);

      for (let i = 0; i < pack.instructions.length; i++) {
        const instrResult = scanText(
          pack.instructions[i].instruction,
          pack.taskId,
          `instructions[${i}]`,
        );
        findings.push(...instrResult.findings);
        fixes.push(...instrResult.fixes);
      }
    }

    // Score: 1.0 - (weightedFindings / maxPossibleScore)
    // error=1.0, warning=0.3, info=0.0
    const weightedFindings = findings.reduce((acc, f) => {
      if (f.severity === 'error') return acc + 1.0;
      if (f.severity === 'warning') return acc + 0.3;
      return acc;
    }, 0);

    // maxPossibleScore is determined by total scannable items * max weight
    const totalScannableItems = Math.max(1, findings.length || 1);
    const score = weightedFindings > 0
      ? Math.max(0, 1.0 - (weightedFindings / totalScannableItems))
      : 1.0;
    const threshold = context.config.gates['security']?.threshold ?? context.config.threshold;
    const passed = score >= threshold;

    return {
      gateId: 'security',
      score,
      passed,
      findings,
      fixes,
      durationMs: performance.now() - start,
    };
  },
};
