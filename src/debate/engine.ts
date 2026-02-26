/**
 * DebateEngine — 3-round multi-agent debate orchestrator (spec Section 6.1, 6.8).
 *
 * Round 1: Proposals — each proposer generates an independent solution
 * Round 2: Cross-Examination — critic agents examine each proposal
 * Round 3: Decision + ADR — judge synthesizes all into a final decision
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
} from './types.js';
import { ConvergenceDetector } from './convergence.js';
import { JudgeSynthesizer } from './judge.js';
import {
  buildProposerPrompt,
  buildCritiquePrompt,
  PROPOSER_SYSTEM_PROMPT,
  CRITIC_SYSTEM_PROMPT,
} from './prompts.js';

export class DebateEngine {
  private readonly _convergenceDetector: ConvergenceDetector;
  private readonly _judge: JudgeSynthesizer;

  constructor(
    private readonly _provider: ProviderAdapter,
    private readonly _resilience: ResilienceLayer,
    private readonly _eventBus: EventBus,
  ) {
    this._convergenceDetector = new ConvergenceDetector();
    this._judge = new JudgeSynthesizer(_provider, _resilience, _eventBus);
  }

  /**
   * Factory method used by OrchestratorEngine to create a DebateEngine
   * with the same provider and resilience layer used by the rest of the pipeline.
   */
  static create(
    provider: ProviderAdapter,
    resilience: ResilienceLayer,
    eventBus: EventBus,
  ): DebateEngine {
    return new DebateEngine(provider, resilience, eventBus);
  }

  /**
   * Run a full debate session.
   *
   * For each configured round:
   *   Round 1: Proposals (one call per proposer)
   *   Round 2: Cross-Examination (one call per proposal)
   *   Round 3: Judge synthesis (single call)
   *
   * Convergence is checked after each round (rounds >= 2).
   * If convergence is achieved, the judge decides immediately.
   * If maxRounds is reached without convergence, the judge is forced to decide.
   */
  async runDebate(config: DebateConfig): Promise<Decision> {
    this._emitDebateStarted(config);

    let proposals: Proposal[] = [];
    let critiques: Critique[] = [];
    let previousCritiques: Critique[] = [];
    let convergenceScore = 0;
    let convergenceAchieved = false;
    let totalTokens = 0;

    for (let round = 1; round <= config.rounds; round++) {
      // Round 1 (or re-proposal round): Generate proposals
      if (round === 1) {
        proposals = await this._runProposalRound(config);
        const proposalTokens = proposals.length * 150; // estimate
        totalTokens += proposalTokens;
      }

      // Round 2+ (or critique round): Generate critiques
      previousCritiques = critiques;
      critiques = await this._runCritiqueRound(config, proposals);
      const critiqueTokens = critiques.length * 150;
      totalTokens += critiqueTokens;

      // Check convergence
      const convergenceResult = this._convergenceDetector.detectConvergence(
        proposals,
        critiques,
        previousCritiques,
        {
          convergenceThreshold: config.convergenceThreshold,
          round,
          tokenUsage: totalTokens,
        },
      );

      convergenceScore = convergenceResult.score;
      convergenceAchieved = convergenceResult.converged;

      this._emitRoundCompleted(round, convergenceScore);

      // If converged and not on the last round, break early for judge decision
      if (convergenceAchieved && round < config.rounds) {
        break;
      }
    }

    // Final round: Judge synthesis
    const decision = await this._judge.synthesize(
      config,
      proposals,
      critiques,
      convergenceScore,
      convergenceAchieved,
    );

    this._emitDecisionMade(config, decision);

    return decision;
  }

  // ─── Round Implementations ──────────────────────────────────────

  private async _runProposalRound(config: DebateConfig): Promise<Proposal[]> {
    const proposals: Proposal[] = [];

    for (let i = 0; i < config.proposerCount; i++) {
      const proposal = await this._resilience.execute<Proposal>(
        this._provider.id,
        async () => {
          const start = Date.now();
          const response = await this._provider.generate({
            model: config.model ?? 'anthropic/claude-sonnet-4',
            systemPrompt: PROPOSER_SYSTEM_PROMPT,
            prompt: buildProposerPrompt(config.topic, config.context),
          });

          const parsed = this._parseProposal(response.content, response.object, `proposer-${i}`);
          return {
            value: parsed,
            tokenUsage: extractTokenUsage(response),
            latencyMs: Date.now() - start,
          };
        },
      );
      proposals.push(proposal);
    }

    return proposals;
  }

  private async _runCritiqueRound(
    config: DebateConfig,
    proposals: readonly Proposal[],
  ): Promise<Critique[]> {
    const critiques: Critique[] = [];

    for (const proposal of proposals) {
      const critique = await this._resilience.execute<Critique>(
        this._provider.id,
        async () => {
          const start = Date.now();
          const response = await this._provider.generate({
            model: config.model ?? 'anthropic/claude-sonnet-4',
            systemPrompt: CRITIC_SYSTEM_PROMPT,
            prompt: buildCritiquePrompt(proposal, proposals),
          });

          const parsed = this._parseCritique(response.content, response.object, proposal.agentId);
          return {
            value: parsed,
            tokenUsage: extractTokenUsage(response),
            latencyMs: Date.now() - start,
          };
        },
      );
      critiques.push(critique);
    }

    return critiques;
  }

  // ─── Parsers ──────────────────────────────────────────────────────

  private _parseProposal(content: string, object: unknown, agentId: string): Proposal {
    const obj = this._resolveObject(content, object);
    return {
      agentId,
      option: String(obj.option ?? ''),
      rationale: String(obj.rationale ?? ''),
      tradeoffs: Array.isArray(obj.tradeoffs) ? obj.tradeoffs.map(String) : [],
      evidence: Array.isArray(obj.evidence) ? obj.evidence.map(String) : [],
    };
  }

  private _parseCritique(content: string, object: unknown, targetProposal: string): Critique {
    const obj = this._resolveObject(content, object);
    return {
      agentId: String(obj.agentId ?? `critic-${targetProposal}`),
      targetProposal,
      strengths: Array.isArray(obj.strengths) ? obj.strengths.map(String) : [],
      weaknesses: Array.isArray(obj.weaknesses) ? obj.weaknesses.map(String) : [],
      questions: Array.isArray(obj.questions) ? obj.questions.map(String) : [],
    };
  }

  private _resolveObject(content: string, object: unknown): Record<string, unknown> {
    if (object && typeof object === 'object') {
      return object as Record<string, unknown>;
    }
    return JSON.parse(content) as Record<string, unknown>;
  }

  // ─── Event Emitters ───────────────────────────────────────────────

  private _emitDebateStarted(config: DebateConfig): void {
    this._eventBus.emit({
      type: 'debate.started',
      topic: config.topic,
      proposerCount: config.proposerCount,
      timestamp: new Date(),
      source: 'debate-engine',
    });
  }

  private _emitRoundCompleted(roundNumber: number, convergenceScore: number): void {
    this._eventBus.emit({
      type: 'debate.round.completed',
      roundNumber,
      convergenceScore,
      timestamp: new Date(),
      source: 'debate-engine',
    });
  }

  private _emitDecisionMade(config: DebateConfig, decision: Decision): void {
    this._eventBus.emit({
      type: 'debate.decision.made',
      decisionId: `debate-${config.topic.toLowerCase().replace(/\s+/g, '-')}`,
      convergenceAchieved: decision.convergenceAchieved,
      timestamp: new Date(),
      source: 'debate-engine',
    });
  }
}
