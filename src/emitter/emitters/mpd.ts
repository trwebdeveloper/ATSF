/**
 * MpdEmitter — T11
 *
 * Emits MPD.md (Master Planning Document): a comprehensive Markdown document.
 * Also writes mpd-data.json (structured data for schema validation/downstream use).
 */

import { createHash } from 'node:crypto';
import type { Emitter, EmitterContext, MpdInput } from '../types.js';

function contentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * Render the MPD as Markdown using string templates (no file-system templates needed for MVP).
 * The output is deterministic given the same input.
 */
function renderMpd(input: MpdInput, generatedAt: string): string {
  const { executiveSummary, technicalArchitecture, componentDesign } = input;
  const { projectName, oneLiner, objectives, targetAudience, scope } = executiveSummary;

  const lines: string[] = [
    `# Master Planning Document`,
    ``,
    `**Project:** ${projectName}`,
    `**Generated:** ${generatedAt}`,
    ``,
    `## Table of Contents`,
    ``,
    `1. [Executive Summary](#executive-summary)`,
    `2. [Project Overview](#project-overview)`,
    `3. [Technical Architecture](#technical-architecture)`,
    `4. [Component Design](#component-design)`,
    `5. [Data Model](#data-model)`,
    `6. [API Design](#api-design)`,
    `7. [Security Considerations](#security-considerations)`,
    `8. [Testing Strategy](#testing-strategy)`,
    `9. [Deployment Plan](#deployment-plan)`,
    `10. [Risk Assessment](#risk-assessment)`,
    `11. [Timeline](#timeline)`,
    `12. [Glossary](#glossary)`,
    `13. [Appendices](#appendices)`,
    ``,
    `---`,
    ``,
    `## Executive Summary`,
    ``,
    oneLiner,
    ``,
    `### Objectives`,
    ``,
    ...objectives.map(o => `- ${o}`),
    ``,
    `### Target Audience`,
    ``,
    ...targetAudience.map(a => `- ${a}`),
    ``,
    `### Scope`,
    ``,
    `**In Scope:**`,
    ...scope.inScope.map(s => `- ${s}`),
    ``,
    `**Out of Scope:**`,
    ...scope.outOfScope.map(s => `- ${s}`),
    ``,
    `---`,
    ``,
    `## Project Overview`,
    ``,
    input.projectOverview.background,
    ``,
    `### Problem Statement`,
    ``,
    input.projectOverview.problemStatement,
    ``,
    `### Proposed Solution`,
    ``,
    input.projectOverview.proposedSolution,
    ``,
    `### Success Criteria`,
    ``,
    ...input.projectOverview.successCriteria.map(c => `- ${c}`),
    ``,
    `---`,
    ``,
    `## Technical Architecture`,
    ``,
    technicalArchitecture.overview,
    ``,
    ...technicalArchitecture.diagrams.flatMap(d => [
      `### ${d.title}`,
      ``,
      '```mermaid',
      d.source,
      '```',
      ``,
    ]),
    `### Patterns`,
    ``,
    ...technicalArchitecture.patterns.map(p => `- **${p.name}**: ${p.rationale}`),
    ``,
    `### Tech Stack`,
    ``,
    ...technicalArchitecture.techStack.map(t => `- **${t.name}** (${t.version ?? 'latest'}): ${t.purpose}`),
    ``,
    `---`,
    ``,
    `## Component Design`,
    ``,
    ...componentDesign.components.flatMap(c => [
      `### ${c.name}`,
      ``,
      c.description,
      ``,
      `**Responsibilities:**`,
      ...c.responsibilities.map(r => `- ${r}`),
      ``,
      `**Task References:** ${c.taskRefs.join(', ')}`,
      ``,
    ]),
    `---`,
    ``,
    `## Data Model`,
    ``,
    input.dataModel.overview,
    ``,
    ...input.dataModel.entities.flatMap(e => [
      `### ${e.name}`,
      ``,
      e.description,
      ``,
    ]),
    `---`,
    ``,
    `## API Design`,
    ``,
    input.apiDesign.overview,
    ``,
    ...input.apiDesign.endpoints.map(e => `- **${e.method}** \`${e.path}\`: ${e.description}`),
    ``,
    `---`,
    ``,
    `## Security Considerations`,
    ``,
    input.securityConsiderations.overview,
    ``,
    ...input.securityConsiderations.threatModel.map(t =>
      `- **${t.threat}** (${t.severity}): ${t.mitigation}`
    ),
    ``,
    `---`,
    ``,
    `## Testing Strategy`,
    ``,
    input.testingStrategy.overview,
    ``,
    ...input.testingStrategy.levels.flatMap(l => [
      `### ${l.name.charAt(0).toUpperCase() + l.name.slice(1)} Tests`,
      ``,
      l.description,
      ``,
      `**Tools:** ${l.tools.join(', ')}`,
      l.coverageTarget ? `**Coverage Target:** ${l.coverageTarget}` : '',
      ``,
    ]).filter(line => line !== undefined),
    `---`,
    ``,
    `## Deployment Plan`,
    ``,
    input.deploymentPlan.overview,
    ``,
    `### Environments`,
    ``,
    ...input.deploymentPlan.environments.map(e => `- **${e.name}**: ${e.purpose}`),
    ``,
    `---`,
    ``,
    `## Risk Assessment`,
    ``,
    ...input.riskAssessment.risks.map(r =>
      `- **${r.id}** (${r.probability}/${r.impact}): ${r.description} — *${r.mitigation}*`
    ),
    ``,
    `---`,
    ``,
    `## Timeline`,
    ``,
    ...input.timeline.phases.flatMap(p => [
      `### ${p.name}`,
      ``,
      p.description,
      ``,
      `**Tasks:** ${p.taskRefs.join(', ')}`,
      ``,
    ]),
    `**Critical Path:** ${input.timeline.criticalPath.join(' → ')}`,
    ``,
    `---`,
    ``,
    `## Glossary`,
    ``,
    ...input.glossary.terms.map(t => `- **${t.term}**: ${t.definition}`),
    ``,
    `---`,
    ``,
    `## Appendices`,
    ``,
    ...(input.appendices.adrs.length > 0 ? [
      `### Architectural Decision Records`,
      ``,
      ...input.appendices.adrs.map(a => `- **${a.id}** — ${a.title} (${a.status}): ${a.summary}`),
      ``,
    ] : []),
    ...(input.appendices.references.length > 0 ? [
      `### References`,
      ``,
      ...input.appendices.references.map(r =>
        r.url ? `- [${r.title}](${r.url})${r.description ? ': ' + r.description : ''}` : `- ${r.title}`
      ),
      ``,
    ] : []),
  ];

  return lines.join('\n');
}

export class MpdEmitter implements Emitter {
  readonly name = 'mpd';

  async emit(ctx: EmitterContext): Promise<void> {
    if (!ctx.mpdInput) {
      // No MPD input provided; skip
      return;
    }

    const input = ctx.mpdInput;

    // Render Markdown
    const markdown = renderMpd(input, ctx.generatedAt);
    ctx.vfs.writeFile('MPD.md', markdown);

    // Also write structured data (with version/generated/checksum) for schema validation
    const structuredData = {
      version: '1.0',
      generated: ctx.generatedAt,
      checksum: contentHash(markdown),
      ...input,
    };
    ctx.vfs.writeFile('mpd-data.json', JSON.stringify(structuredData, null, 2));
  }
}
