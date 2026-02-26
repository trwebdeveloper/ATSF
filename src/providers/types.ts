import type { ZodType } from 'zod';
import type { TokenUsage } from '../shared/types.js';

export type { TokenUsage } from '../shared/types.js';

/**
 * Adapter interface for AI model providers.
 * All providers implement this interface.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedModels: readonly string[];
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  healthCheck(): Promise<boolean>;
}

export interface GenerateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly schema?: ZodType;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface GenerateResponse {
  readonly content: string;
  readonly object?: unknown;
  readonly model: string;
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  readonly usage: TokenUsage;
}

/**
 * Registry for managing multiple ProviderAdapter instances.
 */
export interface ProviderRegistry {
  register(provider: ProviderAdapter): void;
  get(id: string): ProviderAdapter;
  getDefault(): ProviderAdapter;
  list(): readonly ProviderAdapter[];
  healthCheckAll(): Promise<Map<string, boolean>>;
}

/**
 * Utility to extract TokenUsage from a GenerateResponse.
 */
export function extractTokenUsage(response: GenerateResponse): TokenUsage {
  return response.usage;
}
