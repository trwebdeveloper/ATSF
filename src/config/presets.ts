import type { DebateModels } from '../debate/types.js';

// ─── Types ───────────────────────────────────────────────────────────

/** The four built-in mode names. */
export type ModeName = 'free' | 'budget' | 'balanced' | 'premium';

/** Shape of a mode preset — defines models and debate parameters for each mode. */
export interface ModePreset {
  readonly models: Required<DebateModels>;
  readonly rounds: number;
  readonly convergenceThreshold: number;
  readonly proposerCount: number;
}

/** Output of mode resolution — everything the debate engine needs. */
export interface ResolvedDebateSettings {
  readonly models: Required<DebateModels>;
  readonly rounds: number;
  readonly convergenceThreshold: number;
  readonly proposerCount: number;
}

// ─── Preset Definitions ──────────────────────────────────────────────

export const MODE_PRESETS: Readonly<Record<ModeName, ModePreset>> = {
  free: {
    models: {
      proposer: 'qwen/qwen3-coder:free',
      critic: 'nousresearch/hermes-3-llama-3.1-405b:free',
      judge: 'meta-llama/llama-3.3-70b-instruct:free',
    },
    rounds: 2,
    convergenceThreshold: 0.7,
    proposerCount: 2,
  },
  budget: {
    models: {
      proposer: 'qwen/qwen3-coder',
      critic: 'moonshotai/kimi-k2.5',
      judge: 'deepseek/deepseek-r1',
    },
    rounds: 2,
    convergenceThreshold: 0.7,
    proposerCount: 2,
  },
  balanced: {
    models: {
      proposer: 'google/gemini-2.5-pro',
      critic: 'openai/o3',
      judge: 'anthropic/claude-sonnet-4.6',
    },
    rounds: 3,
    convergenceThreshold: 0.8,
    proposerCount: 2,
  },
  premium: {
    models: {
      proposer: 'openai/o3',
      critic: 'qwen/qwen3-coder',
      judge: 'anthropic/claude-opus-4.6',
    },
    rounds: 5,
    convergenceThreshold: 0.9,
    proposerCount: 3,
  },
} as const;

// ─── Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a mode name + optional user overrides into final debate settings.
 *
 * Precedence: explicit user override > mode preset value.
 */
export function resolveMode(
  mode: ModeName,
  userOverrides?: {
    models?: { proposer?: string; critic?: string; judge?: string };
    rounds?: number;
    convergenceThreshold?: number;
  },
): ResolvedDebateSettings {
  const preset = MODE_PRESETS[mode];

  return {
    models: {
      proposer: userOverrides?.models?.proposer ?? preset.models.proposer,
      critic: userOverrides?.models?.critic ?? preset.models.critic,
      judge: userOverrides?.models?.judge ?? preset.models.judge,
    },
    rounds: userOverrides?.rounds ?? preset.rounds,
    convergenceThreshold: userOverrides?.convergenceThreshold ?? preset.convergenceThreshold,
    proposerCount: preset.proposerCount,
  };
}
