import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ProviderAdapter, GenerateRequest, GenerateResponse } from './types.js';

// Supported models list (non-exhaustive; callers are not restricted to this list)
const SUPPORTED_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'anthropic/claude-haiku-4',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
] as const;

export interface OpenRouterProviderOptions {
  /** OpenRouter API key. Falls back to OPENROUTER_API_KEY env var when omitted. */
  apiKey?: string;
}

/**
 * Maps the AI SDK FinishReason (hyphenated) to our GenerateResponse finishReason
 * (underscored). Defaults to 'stop' for any unknown value.
 */
function mapFinishReason(reason: string | undefined): GenerateResponse['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool-calls': return 'tool_calls';
    case 'content-filter': return 'content_filter';
    default: return 'stop';
  }
}

/**
 * ProviderAdapter that delegates to the OpenRouter API via the Vercel AI SDK
 * v5 generateObject() call.
 *
 * Per spec Section 4.5: providers do NO resilience wrapping.
 * Callers (DebateEngine, TaskExecutor, GatePlugin) manage resilience externally.
 */
class OpenRouterProvider implements ProviderAdapter {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly supportedModels: readonly string[] = SUPPORTED_MODELS;

  private readonly _client: ReturnType<typeof createOpenRouter>;

  constructor(options: OpenRouterProviderOptions) {
    this._client = createOpenRouter({
      apiKey: options.apiKey ?? process.env['OPENROUTER_API_KEY'],
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // Build params — schema is optional in our interface but required for
    // generateObject's typed overload. We cast to any for the call and let
    // the AI SDK handle missing-schema gracefully at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: this._client(request.model),
      prompt: request.prompt,
      ...(request.schema !== undefined ? { schema: request.schema } : {}),
      ...(request.systemPrompt !== undefined ? { system: request.systemPrompt } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateObject(params as any);

    const promptTokens = result.usage.inputTokens ?? 0;
    const completionTokens = result.usage.outputTokens ?? 0;
    const totalTokens = result.usage.totalTokens ?? (promptTokens + completionTokens);

    return {
      content: JSON.stringify(result.object),
      object: result.object,
      model: request.model,
      finishReason: mapFinishReason(result.finishReason),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const apiKey = process.env['OPENROUTER_API_KEY'];
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create an OpenRouterProvider.
 */
export function createOpenRouterProvider(
  options: OpenRouterProviderOptions = {},
): ProviderAdapter {
  return new OpenRouterProvider(options);
}
