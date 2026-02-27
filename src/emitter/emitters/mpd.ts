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
/** Ensure a value is an array; return empty array if not. */
function arr<T>(v: T[] | undefined | null): T[] { return Array.isArray(v) ? v : []; }

function renderMpd(input: MpdInput, generatedAt: string, lang: string): string {
  const s = getStrings(lang);
  const executiveSummary = input.executiveSummary ?? { projectName: '', oneLiner: '', objectives: [], targetAudience: [], scope: { inScope: [], outOfScope: [] } };
  const technicalArchitecture = input.technicalArchitecture ?? { overview: '', diagrams: [], patterns: [], techStack: [] };
  const componentDesign = input.componentDesign ?? { components: [] };
  const projectName = executiveSummary.projectName ?? '';
  const oneLiner = executiveSummary.oneLiner ?? '';
  const objectives = arr(executiveSummary.objectives);
  const targetAudience = arr(executiveSummary.targetAudience);
  const scope = executiveSummary.scope ?? { inScope: [], outOfScope: [] };

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
    ...arr(scope.inScope).map(s => `- ${s}`),
    ``,
    `**${s.outOfScope}:**`,
    ...arr(scope.outOfScope).map(s => `- ${s}`),
    ``,
    `---`,
    ``,
    `## ${s.projectOverview}`,
    ``,
    input.projectOverview?.background ?? '',
    ``,
    `### ${s.problemStatement}`,
    ``,
    input.projectOverview?.problemStatement ?? '',
    ``,
    `### ${s.proposedSolution}`,
    ``,
    input.projectOverview?.proposedSolution ?? '',
    ``,
    `### ${s.successCriteria}`,
    ``,
    ...arr(input.projectOverview?.successCriteria).map(c => `- ${c}`),
    ``,
    `---`,
    ``,
    `## ${s.technicalArchitecture}`,
    ``,
    technicalArchitecture.overview ?? '',
    ``,
    ...arr(technicalArchitecture.diagrams).flatMap(d => [
      `### ${d.title}`,
      ``,
      '```mermaid',
      d.source,
      '```',
      ``,
    ]),
    `### ${s.patterns}`,
    ``,
    ...arr(technicalArchitecture.patterns).map(p => `- **${p.name}**: ${p.rationale}`),
    ``,
    `### ${s.techStack}`,
    ``,
    ...arr(technicalArchitecture.techStack).map(t => `- **${t.name}** (${t.version ?? 'latest'}): ${t.purpose}`),
    ``,
    `---`,
    ``,
    `## ${s.componentDesign}`,
    ``,
    ...arr(componentDesign.components).flatMap(c => [
      `### ${c.name}`,
      ``,
      c.description,
      ``,
      `**${s.responsibilities}:**`,
      ...arr(c.responsibilities).map(r => `- ${r}`),
      ``,
      `**${s.taskReferences}:** ${arr(c.taskRefs).join(', ')}`,
      ``,
    ]),
    `---`,
    ``,
    `## ${s.dataModel}`,
    ``,
    input.dataModel?.overview ?? '',
    ``,
    ...arr(input.dataModel?.entities).flatMap(e => [
      `### ${e.name}`,
      ``,
      e.description,
      ``,
    ]),
    `---`,
    ``,
    `## ${s.apiDesign}`,
    ``,
    input.apiDesign?.overview ?? '',
    ``,
    ...arr(input.apiDesign?.endpoints).map(e => `- **${e.method}** \`${e.path}\`: ${e.description}`),
    ``,
    `---`,
    ``,
    `## ${s.securityConsiderations}`,
    ``,
    input.securityConsiderations?.overview ?? '',
    ``,
    ...arr(input.securityConsiderations?.threatModel).map(t =>
      `- **${t.threat}** (${t.severity}): ${t.mitigation}`
    ),
    ``,
    `---`,
    ``,
    `## ${s.testingStrategy}`,
    ``,
    input.testingStrategy?.overview ?? '',
    ``,
    ...arr(input.testingStrategy?.levels).flatMap(l => [
      `### ${l.name.charAt(0).toUpperCase() + l.name.slice(1)} ${s.tests}`,
      ``,
      l.description,
      ``,
      `**${s.tools}:** ${arr(l.tools).join(', ')}`,
      l.coverageTarget ? `**${s.coverageTarget}:** ${l.coverageTarget}` : '',
      ``,
    ]).filter(line => line !== undefined),
    `---`,
    ``,
    `## ${s.deploymentPlan}`,
    ``,
    input.deploymentPlan?.overview ?? '',
    ``,
    `### ${s.environments}`,
    ``,
    ...arr(input.deploymentPlan?.environments).map(e => `- **${e.name}**: ${e.purpose}`),
    ``,
    `---`,
    ``,
    `## ${s.riskAssessment}`,
    ``,
    ...arr(input.riskAssessment?.risks).map(r =>
      `- **${r.id}** (${r.probability}/${r.impact}): ${r.description} — *${r.mitigation}*`
    ),
    ``,
    `---`,
    ``,
    `## ${s.timeline}`,
    ``,
    ...arr(input.timeline?.phases).flatMap(p => [
      `### ${p.name}`,
      ``,
      p.description,
      ``,
      `**${s.tasks}:** ${arr(p.taskRefs).join(', ')}`,
      ``,
    ]),
    `**${s.criticalPath}:** ${arr(input.timeline?.criticalPath).join(' → ')}`,
    ``,
    `---`,
    ``,
    `## ${s.glossary}`,
    ``,
    ...arr(input.glossary?.terms).map(t => `- **${t.term}**: ${t.definition}`),
    ``,
    `---`,
    ``,
    `## ${s.appendices}`,
    ``,
    ...(arr(input.appendices?.adrs).length > 0 ? [
      `### ${s.architecturalDecisionRecords}`,
      ``,
      ...arr(input.appendices?.adrs).map(a => `- **${a.id}** — ${a.title} (${a.status}): ${a.summary}`),
      ``,
    ] : []),
    ...(arr(input.appendices?.references).length > 0 ? [
      `### ${s.references}`,
      ``,
      ...arr(input.appendices?.references).map(r =>
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
