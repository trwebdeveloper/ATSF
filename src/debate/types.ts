/**
 * Debate engine types — implements contracts from spec Section 6.
 */

// ─── DebateConfig ───────────────────────────────────────────────────

export interface DebateConfig {
  readonly topic: string;
  readonly context: string;
  readonly proposerCount: number;       // typically 2-3
  readonly rounds: number;              // default 3
  readonly convergenceThreshold: number; // 0.0-1.0
  /** Model identifier for debate LLM calls. Defaults to provider's default model if omitted. */
  readonly model?: string;
}

// ─── Proposal ───────────────────────────────────────────────────────

export interface Proposal {
  readonly agentId: string;
  readonly option: string;
  readonly rationale: string;
  readonly tradeoffs: readonly string[];
  readonly evidence: readonly string[];
}

// ─── Critique ───────────────────────────────────────────────────────

export interface Critique {
  readonly agentId: string;
  readonly targetProposal: string;
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly questions: readonly string[];
}

// ─── Decision ───────────────────────────────────────────────────────

export interface Decision {
  readonly chosenOption: string;
  readonly rationale: string;
  readonly consensusScore: number;
  readonly confidenceScore: number;
  readonly dissent: readonly DissentEntry[];
  readonly requiresHumanReview: boolean;
  readonly convergenceAchieved: boolean;
}

export interface DissentEntry {
  readonly agent: string;
  readonly position: string;
  readonly reason: string;
}

// ─── Convergence ────────────────────────────────────────────────────

export interface ConvergenceResult {
  readonly converged: boolean;
  readonly score: number;           // 0.0-1.0
  readonly overlappingCriteria: readonly string[];
  readonly divergentCriteria: readonly string[];
  readonly roundMetrics: readonly RoundMetric[];
}

export interface RoundMetric {
  readonly round: number;
  readonly optionAgreement: number;    // 0.0-1.0
  readonly critiqueOverlap: number;    // 0.0-1.0
  readonly tokenUsage: number;
}

// ─── MADR v4 Data ───────────────────────────────────────────────────

export interface MADRv4Data {
  // YAML front matter
  status: 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';
  date: string;                     // YYYY-MM-DD
  decisionMakers: string;           // CORRECTED: was "deciders" in v3
  consulted?: string;
  informed?: string;

  // Content
  title: string;
  context: string;
  decisionDrivers?: string[];
  options: Array<{
    name: string;
    description?: string;
    pros?: string[];
    neutral?: string[];
    cons?: string[];
  }>;
  chosenOption: string;
  rationale: string;
  consequences?: Array<{
    type: 'good' | 'bad';
    description: string;
  }>;
  confirmation?: string;            // CORRECTED: was "validation" in v3
  moreInformation?: string;

  // ATSF extensions (beyond standard MADR)
  debateRef?: string;
  consensusScore?: number;
  confidenceScore?: number;
  dissent?: Array<{ agent: string; position: string; reason: string }>;
  requiresHumanReview?: boolean;
  convergenceAchieved?: boolean;
}

// ─── Prompt Templates ───────────────────────────────────────────────

export interface DebatePromptTemplates {
  readonly PROPOSER_SYSTEM_PROMPT: string;
  readonly CRITIC_SYSTEM_PROMPT: string;
  readonly JUDGE_SYSTEM_PROMPT: string;
}

// ─── Dual Format Output ─────────────────────────────────────────────

export interface DualFormatOutput {
  readonly markdown: string;
  readonly yaml: string;
}

// ─── ADR Generation Input ───────────────────────────────────────────

export interface ADRInput {
  readonly topic: string;
  readonly decision: Decision;
  readonly proposals: readonly Proposal[];
  readonly critiques: readonly Critique[];
  readonly debateId?: string;
}
