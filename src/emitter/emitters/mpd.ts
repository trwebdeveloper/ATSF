/**
 * MpdEmitter — T11
 *
 * Emits MPD.md (Master Planning Document): a comprehensive Markdown document.
 * Also writes mpd-data.json (structured data for schema validation/downstream use).
 */

import { createHash } from 'node:crypto';
import type { Emitter, EmitterContext, MpdInput } from '../types.js';
import { getStrings } from '../i18n.js';

function contentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * Render the MPD as Markdown using string templates (no file-system templates needed for MVP).
 * The output is deterministic given the same input.
 */
function renderMpd(input: MpdInput, generatedAt: string, lang: string): string {
  const s = getStrings(lang);
  const { executiveSummary, technicalArchitecture, componentDesign } = input;
  const { projectName, oneLiner, objectives, targetAudience, scope } = executiveSummary;

  const lines: string[] = [
    `# ${s.masterPlanningDocument}`,
    ``,
    `**${s.project}:** ${projectName}`,
    `**${s.generated}:** ${generatedAt}`,
    ``,
    `## ${s.tableOfContents}`,
    ``,
    `1. [${s.executiveSummary}](#executive-summary)`,
    `2. [${s.projectOverview}](#project-overview)`,
    `3. [${s.technicalArchitecture}](#technical-architecture)`,
    `4. [${s.componentDesign}](#component-design)`,
    `5. [${s.dataModel}](#data-model)`,
    `6. [${s.apiDesign}](#api-design)`,
    `7. [${s.securityConsiderations}](#security-considerations)`,
    `8. [${s.testingStrategy}](#testing-strategy)`,
    `9. [${s.deploymentPlan}](#deployment-plan)`,
    `10. [${s.riskAssessment}](#risk-assessment)`,
    `11. [${s.timeline}](#timeline)`,
    `12. [${s.glossary}](#glossary)`,
    `13. [${s.appendices}](#appendices)`,
    ``,
    `---`,
    ``,
    `## ${s.executiveSummary}`,
    ``,
    oneLiner,
    ``,
    `### ${s.objectives}`,
    ``,
    ...objectives.map(o => `- ${o}`),
    ``,
    `### ${s.targetAudience}`,
    ``,
    ...targetAudience.map(a => `- ${a}`),
    ``,
    `### ${s.scope}`,
    ``,
    `**${s.inScope}:**`,
    ...scope.inScope.map(s => `- ${s}`),
    ``,
    `**${s.outOfScope}:**`,
    ...scope.outOfScope.map(s => `- ${s}`),
    ``,
    `---`,
    ``,
    `## ${s.projectOverview}`,
    ``,
    input.projectOverview.background,
    ``,
    `### ${s.problemStatement}`,
    ``,
    input.projectOverview.problemStatement,
    ``,
    `### ${s.proposedSolution}`,
    ``,
    input.projectOverview.proposedSolution,
    ``,
    `### ${s.successCriteria}`,
    ``,
    ...input.projectOverview.successCriteria.map(c => `- ${c}`),
    ``,
    `---`,
    ``,
    `## ${s.technicalArchitecture}`,
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
    `### ${s.patterns}`,
    ``,
    ...technicalArchitecture.patterns.map(p => `- **${p.name}**: ${p.rationale}`),
    ``,
    `### ${s.techStack}`,
    ``,
    ...technicalArchitecture.techStack.map(t => `- **${t.name}** (${t.version ?? 'latest'}): ${t.purpose}`),
    ``,
    `---`,
    ``,
    `## ${s.componentDesign}`,
    ``,
    ...componentDesign.components.flatMap(c => [
      `### ${c.name}`,
      ``,
      c.description,
      ``,
      `**${s.responsibilities}:**`,
      ...c.responsibilities.map(r => `- ${r}`),
      ``,
      `**${s.taskReferences}:** ${c.taskRefs.join(', ')}`,
      ``,
    ]),
    `---`,
    ``,
    `## ${s.dataModel}`,
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
    `## ${s.apiDesign}`,
    ``,
    input.apiDesign.overview,
    ``,
    ...input.apiDesign.endpoints.map(e => `- **${e.method}** \`${e.path}\`: ${e.description}`),
    ``,
    `---`,
    ``,
    `## ${s.securityConsiderations}`,
    ``,
    input.securityConsiderations.overview,
    ``,
    ...input.securityConsiderations.threatModel.map(t =>
      `- **${t.threat}** (${t.severity}): ${t.mitigation}`
    ),
    ``,
    `---`,
    ``,
    `## ${s.testingStrategy}`,
    ``,
    input.testingStrategy.overview,
    ``,
    ...input.testingStrategy.levels.flatMap(l => [
      `### ${l.name.charAt(0).toUpperCase() + l.name.slice(1)} ${s.tests}`,
      ``,
      l.description,
      ``,
      `**${s.tools}:** ${l.tools.join(', ')}`,
      l.coverageTarget ? `**${s.coverageTarget}:** ${l.coverageTarget}` : '',
      ``,
    ]).filter(line => line !== undefined),
    `---`,
    ``,
    `## ${s.deploymentPlan}`,
    ``,
    input.deploymentPlan.overview,
    ``,
    `### ${s.environments}`,
    ``,
    ...input.deploymentPlan.environments.map(e => `- **${e.name}**: ${e.purpose}`),
    ``,
    `---`,
    ``,
    `## ${s.riskAssessment}`,
    ``,
    ...input.riskAssessment.risks.map(r =>
      `- **${r.id}** (${r.probability}/${r.impact}): ${r.description} — *${r.mitigation}*`
    ),
    ``,
    `---`,
    ``,
    `## ${s.timeline}`,
    ``,
    ...input.timeline.phases.flatMap(p => [
      `### ${p.name}`,
      ``,
      p.description,
      ``,
      `**${s.tasks}:** ${p.taskRefs.join(', ')}`,
      ``,
    ]),
    `**${s.criticalPath}:** ${input.timeline.criticalPath.join(' → ')}`,
    ``,
    `---`,
    ``,
    `## ${s.glossary}`,
    ``,
    ...input.glossary.terms.map(t => `- **${t.term}**: ${t.definition}`),
    ``,
    `---`,
    ``,
    `## ${s.appendices}`,
    ``,
    ...(input.appendices.adrs.length > 0 ? [
      `### ${s.architecturalDecisionRecords}`,
      ``,
      ...input.appendices.adrs.map(a => `- **${a.id}** — ${a.title} (${a.status}): ${a.summary}`),
      ``,
    ] : []),
    ...(input.appendices.references.length > 0 ? [
      `### ${s.references}`,
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
    const markdown = renderMpd(input, ctx.generatedAt, ctx.lang);
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
