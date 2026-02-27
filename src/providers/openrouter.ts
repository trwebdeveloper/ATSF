import { generateText } from 'ai';
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
 * Extract JSON from model response text.
 * Handles: raw JSON, markdown code blocks, thinking tags wrapping JSON.
 */
function extractJson(text: string): string {
  // Try raw JSON first
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  // Try markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object/array in the text
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart !== -1) {
    // Find the matching closing brace
    let depth = 0;
    for (let i = jsonStart; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++;
      if (trimmed[i] === '}') depth--;
      if (depth === 0) {
        return trimmed.slice(jsonStart, i + 1);
      }
    }
  }

  return trimmed;
}

/**
 * ProviderAdapter that delegates to the OpenRouter API via the Vercel AI SDK.
 * Uses generateText + manual JSON parsing for maximum compatibility with
 * different models that may not perfectly follow JSON Schema constraints.
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
    // Build the prompt with JSON instruction
    let prompt = request.prompt;
    if (request.schema) {
      prompt += '\n\nIMPORTANT: Respond with ONLY a valid JSON object. No markdown, no explanation, no code blocks. Just the raw JSON.';
    }

    const result = await generateText({
      model: this._client(request.model),
      prompt,
      ...(request.systemPrompt !== undefined ? { system: request.systemPrompt } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
    });

    const promptTokens = result.usage.inputTokens ?? 0;
    const completionTokens = result.usage.outputTokens ?? 0;
    const totalTokens = result.usage.totalTokens ?? (promptTokens + completionTokens);

    let object: unknown = undefined;
    const rawText = result.text;

    if (request.schema) {
      const jsonStr = extractJson(rawText);
      try {
        const parsed = JSON.parse(jsonStr);
        // Try schema validation — use safeParse for lenient handling
        const validation = request.schema.safeParse(parsed);
        object = validation.success ? validation.data : parsed;
      } catch {
        throw new Error(`Model returned invalid JSON for schema request. Raw text (first 500 chars): ${rawText.substring(0, 500)}`);
      }
    }

    return {
      content: rawText,
      object,
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
