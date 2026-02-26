/**
 * Judge synthesis for the debate engine (spec Section 6.2).
 *
 * The judge receives all proposals and all critiques, then produces:
 * - A single chosen option with rationale
 * - A consensus score (0.0-1.0)
 * - A confidence score (0.0-1.0)
 * - Structured dissent entries
 *
 * All LLM calls go through ResilienceLayer.execute().
 */

import type { ProviderAdapter } from '../providers/types.js';
import { extractTokenUsage } from '../providers/types.js';
import type { EventBus } from '../events/types.js';
import type { ResilienceLayer } from '../resilience/resilience-layer.js';
import type {
  DebateConfig,
  Proposal,
  Critique,
  Decision,
  DissentEntry,
} from './types.js';
import { buildJudgePrompt, JUDGE_SYSTEM_PROMPT } from './prompts.js';
import { withLangDirective } from '../emitter/i18n.js';

/** Raw decision shape returned by the LLM (before post-processing). */
interface RawDecision {
  readonly chosenOption: string;
  readonly rationale: string;
  readonly consensusScore: number;
  readonly confidenceScore: number;
  readonly dissent: ReadonlyArray<{ agent: string; position: string; reason: string }>;
  readonly requiresHumanReview: boolean;
  readonly convergenceAchieved: boolean;
}

export class JudgeSynthesizer {
  constructor(
    private readonly _provider: ProviderAdapter,
    private readonly _resilience: ResilienceLayer,
    private readonly _eventBus: EventBus,
  ) {}

  /**
   * Synthesize a Decision from proposals, critiques, and convergence data.
   *
   * @param config - Debate configuration
   * @param proposals - All proposals from round 1
   * @param critiques - All critiques from round 2
   * @param convergenceScore - Current convergence score
   * @param convergenceAchieved - Whether convergence was achieved
   */
  async synthesize(
    config: DebateConfig,
    proposals: readonly Proposal[],
    critiques: readonly Critique[],
    convergenceScore: number,
    convergenceAchieved: boolean,
  ): Promise<Decision> {
    const raw = await this._resilience.execute<RawDecision>(
      this._provider.id,
      async () => {
        const start = Date.now();
        const response = await this._provider.generate({
          model: config.models?.judge ?? config.model ?? 'anthropic/claude-sonnet-4',
          systemPrompt: withLangDirective(JUDGE_SYSTEM_PROMPT, config.lang ?? 'en'),
          prompt: buildJudgePrompt(config.topic, proposals, critiques),
        });

        const parsed = this._parseResponse(response.content, response.object);
        return {
          value: parsed,
          tokenUsage: extractTokenUsage(response),
          latencyMs: Date.now() - start,
        };
      },
    );

    return this._postProcess(raw, convergenceScore, convergenceAchieved);
  }

  /**
   * Post-process the raw judge decision to apply spec rules:
   * - Cap confidence at convergenceScore * 0.8 when not converged
   * - Set requiresHumanReview = true when convergenceScore < 0.5
   */
  private _postProcess(
    raw: RawDecision,
    convergenceScore: number,
    convergenceAchieved: boolean,
  ): Decision {
    let confidenceScore = raw.confidenceScore;
    const requiresHumanReview = convergenceScore < 0.5;

    if (!convergenceAchieved) {
      // Confidence penalty: capped at convergenceScore * 0.8
      const cap = convergenceScore * 0.8;
      confidenceScore = Math.min(confidenceScore, cap);
    }

    const dissent: readonly DissentEntry[] = raw.dissent.map(d => ({
      agent: d.agent,
      position: d.position,
      reason: d.reason,
    }));

    return {
      chosenOption: raw.chosenOption,
      rationale: raw.rationale,
      consensusScore: convergenceScore,
      confidenceScore,
      dissent,
      requiresHumanReview,
      convergenceAchieved,
    };
  }

  private _parseResponse(content: string, object?: unknown): RawDecision {
    // If the provider returned a structured object, use it directly
    if (object && typeof object === 'object') {
      const obj = object as Record<string, unknown>;
      return {
        chosenOption: String(obj.chosenOption ?? ''),
        rationale: String(obj.rationale ?? ''),
        consensusScore: Number(obj.consensusScore ?? 0),
        confidenceScore: Number(obj.confidenceScore ?? 0),
        dissent: Array.isArray(obj.dissent) ? obj.dissent.map((d: Record<string, unknown>) => ({
          agent: String(d.agent ?? ''),
          position: String(d.position ?? ''),
          reason: String(d.reason ?? ''),
        })) : [],
        requiresHumanReview: Boolean(obj.requiresHumanReview),
        convergenceAchieved: Boolean(obj.convergenceAchieved),
      };
    }

    // Fall back to JSON parsing
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      chosenOption: String(parsed.chosenOption ?? ''),
      rationale: String(parsed.rationale ?? ''),
      consensusScore: Number(parsed.consensusScore ?? 0),
      confidenceScore: Number(parsed.confidenceScore ?? 0),
      dissent: Array.isArray(parsed.dissent) ? parsed.dissent.map((d: Record<string, unknown>) => ({
        agent: String(d.agent ?? ''),
        position: String(d.position ?? ''),
        reason: String(d.reason ?? ''),
      })) : [],
      requiresHumanReview: Boolean(parsed.requiresHumanReview),
      convergenceAchieved: Boolean(parsed.convergenceAchieved),
    };
  }
}
