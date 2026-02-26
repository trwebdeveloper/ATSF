/**
 * PromptPackEmitter — T11
 *
 * Emits self-contained, per-task prompts for downstream code generation tools.
 * Each prompt pack is written to:
 *   ai_prompt_pack/{taskId}.md  (Markdown for humans/AI consumption)
 *   ai_prompt_pack/{taskId}.json (structured data for schema validation)
 */

import type { Emitter, EmitterContext, PromptPackInput } from '../types.js';

/** Render a prompt pack as Markdown. */
function renderPromptPack(pack: PromptPackInput): string {
  const lines: string[] = [
    `# Task: ${pack.taskId} - ${pack.taskName}`,
    ``,
    `## Context`,
    ``,
    pack.context,
    ``,
    `## Contract`,
    ``,
    `Your output MUST conform to these specifications:`,
    ``,
    `### Output Files`,
    ``,
    ...pack.contract.outputFiles.flatMap(f => [
      `- **File:** \`${f.filePath}\``,
      `  - Description: ${f.description}`,
      ...(f.exports.length > 0 ? [`  - Exports: ${f.exports.join(', ')}`] : []),
      ``,
    ]),
  ];

  if (pack.contract.dependencies.length > 0) {
    lines.push(`### Dependencies`, ``);
    for (const dep of pack.contract.dependencies) {
      lines.push(`- ${dep.name}@${dep.version}${dep.purpose ? ': ' + dep.purpose : ''}`);
    }
    lines.push(``);
  }

  if (pack.inputFiles.length > 0) {
    lines.push(`## Input Files (Read-Only)`, ``);
    for (const f of pack.inputFiles) {
      lines.push(`- \`${f.filePath}\` (from ${f.sourceTask})${f.description ? ': ' + f.description : ''}`);
    }
    lines.push(``);
  }

  if (pack.previousTaskOutputs.length > 0) {
    lines.push(`## Previous Task Outputs`, ``);
    for (const p of pack.previousTaskOutputs) {
      lines.push(`- ${p.taskId}: \`${p.filePath}\` → inject at \`${p.injectionPoint}\` (${p.mode})`);
    }
    lines.push(``);
  }

  lines.push(`## Instructions`, ``);
  for (const step of pack.instructions) {
    lines.push(`${step.step}. ${step.instruction}`);
  }
  lines.push(``);

  lines.push(`## DO NOT`, ``);
  for (const constraint of pack.constraints) {
    lines.push(`- ${constraint}`);
  }
  lines.push(``);

  lines.push(`## Test Criteria`, ``);
  for (const criterion of pack.testCriteria) {
    lines.push(`- ${criterion}`);
  }
  lines.push(``);

  lines.push(`---`, ``);
  lines.push(`**Complexity:** ${pack.estimatedComplexity} | **Suggested Model:** ${pack.suggestedModel}`);

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

      ctx.vfs.writeFile(mdPath, renderPromptPack(pack));
      ctx.vfs.writeFile(jsonPath, JSON.stringify(pack, null, 2));
    }
  }
}
