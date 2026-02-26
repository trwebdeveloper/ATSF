/**
 * Debate prompt templates (spec Section 6.8.2).
 *
 * System prompts include: (1) role identity, (2) output schema reminder, (3) evaluation criteria.
 * Prompt builder functions construct the user-facing prompt for each round.
 */

import type { Proposal, Critique } from './types.js';

// ─── System Prompts ─────────────────────────────────────────────────

export const PROPOSER_SYSTEM_PROMPT = `You are a technical architect proposing a solution to an architectural question.

Your response MUST be valid JSON with this exact schema:
{
  "option": "<string: name of your proposed solution>",
  "rationale": "<string: why this is the best approach>",
  "tradeoffs": ["<string: tradeoff 1>", ...],
  "evidence": ["<string: supporting evidence 1>", ...]
}

Evaluation criteria:
- Technical feasibility and maturity
- Alignment with stated requirements
- Scalability and maintainability
- Developer experience and ecosystem support`;

export const CRITIC_SYSTEM_PROMPT = `You are a critical reviewer examining architectural proposals.

Your response MUST be valid JSON with this exact schema:
{
  "strengths": ["<string: strength 1>", ...],
  "weaknesses": ["<string: weakness 1>", ...],
  "questions": ["<string: question 1>", ...]
}

Evaluation criteria:
- Identify genuine strengths with evidence
- Surface realistic weaknesses and risks
- Ask clarifying questions that expose assumptions
- Compare against alternatives fairly`;

export const JUDGE_SYSTEM_PROMPT = `You are a senior architect synthesizing a final decision from multiple proposals and critiques.

Your response MUST be valid JSON with this exact schema:
{
  "chosenOption": "<string: the selected option>",
  "rationale": "<string: detailed justification>",
  "consensusScore": <number 0.0-1.0: degree of agreement>,
  "confidenceScore": <number 0.0-1.0: confidence in decision>,
  "dissent": [{"agent": "<string>", "position": "<string>", "reason": "<string>"}],
  "requiresHumanReview": <boolean>,
  "convergenceAchieved": <boolean>
}

Evaluation criteria:
- Weigh all proposals and critiques fairly
- Choose the option with the strongest evidence and fewest critical weaknesses
- Record dissenting views accurately
- Set requiresHumanReview to true if significant uncertainty remains`;

// ─── Prompt Builder Functions ───────────────────────────────────────

export function buildProposerPrompt(topic: string, context: string): string {
  return `Topic: ${topic}

Context: ${context}

Please propose a solution to this architectural question. Provide your response as JSON.`;
}

export function buildCritiquePrompt(
  proposal: Proposal,
  allProposals: readonly Proposal[],
): string {
  const otherOptions = allProposals
    .filter(p => p.agentId !== proposal.agentId)
    .map(p => p.option)
    .join(', ');

  return `Review the following proposal:

Proposal by ${proposal.agentId}: "${proposal.option}"
Rationale: ${proposal.rationale}
Tradeoffs: ${proposal.tradeoffs.join('; ')}
Evidence: ${proposal.evidence.join('; ')}

Other options being considered: ${otherOptions || 'none'}

Provide your critique as JSON with strengths, weaknesses, and questions.`;
}

export function buildJudgePrompt(
  topic: string,
  proposals: readonly Proposal[],
  critiques: readonly Critique[],
): string {
  const proposalSection = proposals.map(p =>
    `- ${p.agentId} proposes "${p.option}": ${p.rationale}
  Tradeoffs: ${p.tradeoffs.join('; ')}
  Evidence: ${p.evidence.join('; ')}`
  ).join('\n');

  const critiqueSection = critiques.map(c =>
    `- ${c.agentId} critiques ${c.targetProposal}:
  Strengths: ${c.strengths.join('; ')}
  Weaknesses: ${c.weaknesses.join('; ')}
  Questions: ${c.questions.join('; ')}`
  ).join('\n');

  return `Topic: ${topic}

## Proposals
${proposalSection}

## Critiques
${critiqueSection}

Synthesize a final decision. Choose the option with the strongest evidence. Record all dissenting views. Provide your response as JSON.`;
}
