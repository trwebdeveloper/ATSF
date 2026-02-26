/**
 * PromptPackEmitter — T11
 *
 * Emits self-contained, per-task prompts for downstream code generation tools.
 * Each prompt pack is written to:
 *   ai_prompt_pack/{taskId}.md  (Markdown for humans/AI consumption)
 *   ai_prompt_pack/{taskId}.json (structured data for schema validation)
 */

import type { Emitter, EmitterContext, PromptPackInput } from '../types.js';
import { getStrings } from '../i18n.js';

/** Render a prompt pack as Markdown. */
function renderPromptPack(pack: PromptPackInput, lang: string): string {
  const s = getStrings(lang);
  const lines: string[] = [
    `# Task: ${pack.taskId} - ${pack.taskName}`,
    ``,
    `## ${s.context}`,
    ``,
    pack.context,
    ``,
    `## ${s.contract}`,
    ``,
    `Your output MUST conform to these specifications:`,
    ``,
    `### ${s.outputFiles}`,
    ``,
    ...pack.contract.outputFiles.flatMap(f => [
      `- **File:** \`${f.filePath}\``,
      `  - ${s.description}: ${f.description}`,
      ...(f.exports.length > 0 ? [`  - Exports: ${f.exports.join(', ')}`] : []),
      ``,
    ]),
  ];

  if (pack.contract.dependencies.length > 0) {
    lines.push(`### ${s.dependencies}`, ``);
    for (const dep of pack.contract.dependencies) {
      lines.push(`- ${dep.name}@${dep.version}${dep.purpose ? ': ' + dep.purpose : ''}`);
    }
    lines.push(``);
  }

  if (pack.inputFiles.length > 0) {
    lines.push(`## ${s.inputFilesReadOnly}`, ``);
    for (const f of pack.inputFiles) {
      lines.push(`- \`${f.filePath}\` (from ${f.sourceTask})${f.description ? ': ' + f.description : ''}`);
    }
    lines.push(``);
  }

  if (pack.previousTaskOutputs.length > 0) {
    lines.push(`## ${s.previousTaskOutputs}`, ``);
    for (const p of pack.previousTaskOutputs) {
      lines.push(`- ${p.taskId}: \`${p.filePath}\` → inject at \`${p.injectionPoint}\` (${p.mode})`);
    }
    lines.push(``);
  }

  lines.push(`## ${s.instructions}`, ``);
  for (const step of pack.instructions) {
    lines.push(`${step.step}. ${step.instruction}`);
  }
  lines.push(``);

  lines.push(`## ${s.doNot}`, ``);
  for (const constraint of pack.constraints) {
    lines.push(`- ${constraint}`);
  }
  lines.push(``);

  lines.push(`## ${s.testCriteria}`, ``);
  for (const criterion of pack.testCriteria) {
    lines.push(`- ${criterion}`);
  }
  lines.push(``);

  lines.push(`---`, ``);
  lines.push(`**${s.complexity}:** ${pack.estimatedComplexity} | **${s.suggestedModel}:** ${pack.suggestedModel}`);

  return lines.join('\n');
}

export class PromptPackEmitter implements Emitter {
  readonly name = 'prompt-pack';

  async emit(ctx: EmitterContext): Promise<void> {
    const packs = ctx.promptPackInput ?? [];

    for (const pack of packs) {
      const taskId = pack.taskId;
      const mdPath = `ai_prompt_pack/${taskId}.md`;
      const jsonPath = `ai_prompt_pack/${taskId}.json`;

      ctx.vfs.writeFile(mdPath, renderPromptPack(pack, ctx.lang));
      ctx.vfs.writeFile(jsonPath, JSON.stringify(pack, null, 2));
    }
  }
}
