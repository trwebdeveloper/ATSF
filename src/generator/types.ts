/**
 * Generator types — defines config and result interfaces for the artifact generation pipeline.
 */

import type { ProviderAdapter } from '../providers/types.js';
import type {
  TaskGraphInput,
  RepoBlueprintInput,
  MpdInput,
  TicketInput,
  PromptPackInput,
} from '../emitter/types.js';

export interface GeneratorConfig {
  readonly provider: ProviderAdapter;
  readonly model: string;
  readonly lang: string;
  readonly signal?: AbortSignal;
}

export interface GeneratorResult {
  readonly taskGraphInput: TaskGraphInput;
  readonly repoBlueprintInput: RepoBlueprintInput;
  readonly mpdInput: MpdInput;
  readonly ticketsInput: TicketInput[];
  readonly promptPackInput: PromptPackInput[];
  readonly totalTokensUsed: number;
  readonly totalCostUsd: number;
}
