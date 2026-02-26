import { describe, it, expect } from 'vitest';
import { securityGate, SECRET_PATTERNS, INJECTION_PATTERNS, ALLOWLIST_PATTERNS } from '../../../src/gates/security.js';
import { createGateContext, createMinimalArtifactSet } from './helpers.js';

describe('Security Gate', () => {
  it('has correct metadata', () => {
    expect(securityGate.id).toBe('security');
    expect(securityGate.name).toBe('Security Gate');
    expect(securityGate.priority).toBe(0);
    expect(securityGate.fixable).toBe(true);
  });

  it('produces GateResult with findings', async () => {
    const context = createGateContext();
    const result = await securityGate.run(context);

    expect(result.gateId).toBe('security');
    expect(typeof result.score).toBe('number');
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });

  it('passes for clean artifacts', async () => {
    const context = createGateContext();
    const result = await securityGate.run(context);

    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
  });

  it('detects AWS access keys', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Use AWS key AKIAIOSFODNN7EXAMPLE to access S3 bucket resources',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    const awsFindings = result.findings.filter(f => f.ruleId === 'secret-aws-key');
    expect(awsFindings.length).toBeGreaterThan(0);
    expect(awsFindings[0].severity).toBe('error');
  });

  it('detects connection strings with credentials', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Connect to postgres://admin:password123@localhost:5432/mydb for data processing',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    const connFindings = result.findings.filter(f => f.ruleId === 'secret-connection-string');
    expect(connFindings.length).toBeGreaterThan(0);
    expect(connFindings[0].severity).toBe('error');
  });

  it('detects API keys in plain text', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Set api_key="sk_live_ABCDEFGHIJKLMNOP1234" for the payment processing system',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    const apiKeyFindings = result.findings.filter(f => f.ruleId === 'secret-api-key');
    expect(apiKeyFindings.length).toBeGreaterThan(0);
  });

  it('detects shell injection patterns', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Run cleanup with command; rm -rf /tmp/data to clear temporary files',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    const injectionFindings = result.findings.filter(f => f.ruleId === 'injection-dangerous-command');
    expect(injectionFindings.length).toBeGreaterThan(0);
  });

  it('respects allowlist for safe patterns', async () => {
    // Environment variable references should not trigger
    expect(ALLOWLIST_PATTERNS.some(p => p.test('${API_KEY}'))).toBe(true);
    expect(ALLOWLIST_PATTERNS.some(p => p.test('process.env.SECRET_KEY'))).toBe(true);
    expect(ALLOWLIST_PATTERNS.some(p => p.test('placeholder value'))).toBe(true);
  });

  it('generates fixes that replace secrets with env var references', async () => {
    const artifacts = createMinimalArtifactSet();
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Use AWS key AKIAIOSFODNN7EXAMPLE to access resources in production',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    const secretFixes = result.fixes.filter(f => f.ruleId === 'secret-aws-key');
    expect(secretFixes.length).toBeGreaterThan(0);
    expect(secretFixes[0].fix.type).toBe('replace');
    const fixValue = secretFixes[0].fix.value as string;
    expect(fixValue).toContain('REDACTED_SECRET');
  });

  it('calculates weighted score: error=1.0, warning=0.3, info=0.0', async () => {
    const artifacts = createMinimalArtifactSet();
    // Inject a command substitution (warning)
    artifacts.taskGraph.tasks[0] = {
      ...artifacts.taskGraph.tasks[0],
      description: 'Execute command $(echo hello) to verify system configuration works',
    };

    const context = createGateContext({ artifacts });
    const result = await securityGate.run(context);

    // Should have a warning, which reduces score by 0.3 weight
    const warningFindings = result.findings.filter(f => f.severity === 'warning');
    expect(warningFindings.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1.0);
  });

  it('returns early on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createGateContext({ signal: controller.signal });
    const result = await securityGate.run(context);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('has expected number of secret patterns', () => {
    expect(SECRET_PATTERNS.length).toBe(5);
  });

  it('has expected number of injection patterns', () => {
    expect(INJECTION_PATTERNS.length).toBe(3);
  });
});
