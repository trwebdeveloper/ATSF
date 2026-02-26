/**
 * ADR Generator — produces MADR v4.0 Architecture Decision Records (spec Section 6.3-6.7).
 *
 * Generates dual-format output:
 *   - Markdown: Human-readable ADR using Eta template
 *   - YAML: Machine-readable structured debate data
 */

import { Eta } from 'eta';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import * as yaml from 'yaml';
import type {
  Proposal,
  Critique,
  MADRv4Data,
  DualFormatOutput,
  ADRInput,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the Eta template for ADR generation. */
const TEMPLATE_PATH = join(__dirname, '..', 'emitter', 'templates');
const TEMPLATE_NAME = 'adr.eta';

export class ADRGenerator {
  private readonly _eta: Eta;
  private readonly _template: string;

  constructor() {
    this._eta = new Eta({ views: TEMPLATE_PATH, autoEscape: false });
    this._template = readFileSync(join(TEMPLATE_PATH, TEMPLATE_NAME), 'utf-8');
  }

  /**
   * Generate an ADR markdown string from debate output.
   */
  async generate(input: ADRInput): Promise<string> {
    const data = this.buildMADRData(input);
    const rendered = this._eta.renderString(this._template, data);
    return rendered;
  }

  /**
   * Build MADR v4 data from debate output.
   * Public for testing.
   */
  buildMADRData(input: ADRInput): MADRv4Data {
    const { topic, decision, proposals, critiques } = input;

    // Build options from proposals with critique-derived pros/cons
    const options = this._buildOptions(proposals, critiques);

    // Build consequences from the chosen option's pros/cons
    const chosenOpt = options.find(o => o.name === decision.chosenOption);
    const consequences: Array<{ type: 'good' | 'bad'; description: string }> = [];
    if (chosenOpt) {
      for (const pro of chosenOpt.pros ?? []) {
        consequences.push({ type: 'good', description: pro });
      }
      for (const con of chosenOpt.cons ?? []) {
        consequences.push({ type: 'bad', description: con });
      }
    }

    // Build confirmation text
    let confirmation = '';
    if (!decision.convergenceAchieved) {
      confirmation = `Decision made under non-convergence (score: ${decision.consensusScore.toFixed(2)}). Dissenting views recorded below.`;
    }

    return {
      status: 'proposed',
      date: new Date().toISOString().split('T')[0],
      decisionMakers: 'ATSF Debate Engine',
      title: topic,
      context: `Architectural decision for: ${topic}`,
      options,
      chosenOption: decision.chosenOption,
      rationale: decision.rationale,
      consequences: consequences.length > 0 ? consequences : undefined,
      confirmation: confirmation || undefined,
      consensusScore: decision.consensusScore,
      confidenceScore: decision.confidenceScore,
      dissent: decision.dissent.length > 0
        ? decision.dissent.map(d => ({ agent: d.agent, position: d.position, reason: d.reason }))
        : undefined,
      requiresHumanReview: decision.requiresHumanReview,
      convergenceAchieved: decision.convergenceAchieved,
      debateRef: input.debateId,
    };
  }

  /**
   * Generate both markdown and YAML output (spec Section 6.7).
   */
  async generateDualFormat(input: ADRInput): Promise<DualFormatOutput> {
    const markdown = await this.generate(input);
    const yamlData = this._buildYamlData(input);
    const yamlStr = yaml.stringify(yamlData);

    return { markdown, yaml: yamlStr };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private _buildOptions(
    proposals: readonly Proposal[],
    critiques: readonly Critique[],
  ): MADRv4Data['options'] {
    // Deduplicate options by name (case-insensitive)
    const seen = new Set<string>();
    const options: MADRv4Data['options'] = [];

    for (const proposal of proposals) {
      const key = proposal.option.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);

      // Find critiques targeting this proposal's agent
      const relatedCritiques = critiques.filter(
        c => c.targetProposal === proposal.agentId,
      );

      const pros: string[] = [];
      const cons: string[] = [];
      for (const c of relatedCritiques) {
        pros.push(...c.strengths);
        cons.push(...c.weaknesses);
      }

      // Also add tradeoffs as neutral
      options.push({
        name: proposal.option,
        description: proposal.rationale,
        pros: pros.length > 0 ? pros : undefined,
        cons: cons.length > 0 ? cons : undefined,
      });
    }

    return options;
  }

  private _buildYamlData(input: ADRInput): Record<string, unknown> {
    const { topic, decision, proposals, critiques, debateId } = input;

    return {
      debateId: debateId ?? `debate-${topic.toLowerCase().replace(/\s+/g, '-')}`,
      topic,
      rounds: 3,
      convergenceScore: decision.consensusScore,
      decision: {
        chosenOption: decision.chosenOption,
        rationale: decision.rationale,
      },
      proposals: proposals.map(p => ({
        agentId: p.agentId,
        option: p.option,
        rationale: p.rationale,
        tradeoffs: [...p.tradeoffs],
        evidence: [...p.evidence],
      })),
      critiques: critiques.map(c => ({
        agentId: c.agentId,
        targetProposal: c.targetProposal,
        strengths: [...c.strengths],
        weaknesses: [...c.weaknesses],
        questions: [...c.questions],
      })),
      adrPath: `decisions/${debateId ?? topic.toLowerCase().replace(/\s+/g, '-')}.md`,
    };
  }
}
