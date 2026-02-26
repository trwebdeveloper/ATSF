import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Use vi.hoisted() so variables are available inside vi.mock() factories
// ---------------------------------------------------------------------------
const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
  generateText: vi.fn(),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => {
    // Returns a factory function that returns a model object
    return (modelId: string) => ({ _modelId: modelId, type: 'language-model' });
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------
import { createOpenRouterProvider } from '../../../src/providers/openrouter.js';
import type { GenerateRequest } from '../../../src/providers/types.js';

const mockFetch = vi.fn();

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy-path response
    // Note: AI SDK v5 uses inputTokens/outputTokens (LanguageModelV2Usage), not promptTokens/completionTokens
    mockGenerateObject.mockResolvedValue({
      object: { answer: 42 },
      finishReason: 'stop',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    });
    // Replace global fetch for healthCheck tests
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  it('has id "openrouter"', () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    expect(provider.id).toBe('openrouter');
  });

  it('has correct name', () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('OpenRouter');
  });

  it('has non-empty supportedModels list', () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    expect(provider.supportedModels.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // generate() — calls generateObject with correct params
  // -------------------------------------------------------------------------

  it('calls generateObject() with model, schema, prompt, and system prompt', async () => {
    const schema = z.object({ answer: z.number() });
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    const request: GenerateRequest = {
      model: 'anthropic/claude-sonnet-4',
      prompt: 'What is 6 * 7?',
      systemPrompt: 'You are a calculator.',
      schema,
    };

    await provider.generate(request);

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.schema).toBe(schema);
    expect(callArgs.prompt).toBe('What is 6 * 7?');
    expect(callArgs.system).toBe('You are a calculator.');
    // model should be a model object created by openrouter factory
    expect(callArgs.model).toBeDefined();
  });

  it('calls generateObject() without system when systemPrompt is absent', async () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Hello',
    });

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.system).toBeUndefined();
  });

  it('passes maxTokens and temperature when provided', async () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Hi',
      temperature: 0.5,
      maxTokens: 256,
    });

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0.5);
    // Our implementation maps request.maxTokens → maxOutputTokens (AI SDK v5 field name)
    expect(callArgs.maxOutputTokens).toBe(256);
  });

  // -------------------------------------------------------------------------
  // generate() — returns GenerateResponse with usage field
  // -------------------------------------------------------------------------

  it('returns GenerateResponse with content, object, model, finishReason, and usage', async () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    const response = await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'What is 6 * 7?',
      schema: z.object({ answer: z.number() }),
    });

    expect(response.content).toBe(JSON.stringify({ answer: 42 }));
    expect(response.object).toEqual({ answer: 42 });
    expect(response.model).toBe('anthropic/claude-sonnet-4');
    expect(response.finishReason).toBe('stop');
    expect(response.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('defaults finishReason to "stop" when not provided by SDK', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {},
      finishReason: undefined,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Hi',
    });

    expect(response.finishReason).toBe('stop');
  });

  // -------------------------------------------------------------------------
  // generate() without schema — falls back to generateObject path
  // -------------------------------------------------------------------------

  it('passes prompt through generateObject even without a schema', async () => {
    mockGenerateObject.mockResolvedValue({
      object: 'plain text',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    });

    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Say hello',
    });

    expect(response.content).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // healthCheck()
  // -------------------------------------------------------------------------

  it('healthCheck() returns true when OpenRouter API is reachable', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const result = await provider.healthCheck();
    expect(result).toBe(true);
  });

  it('healthCheck() returns false when OpenRouter API is unreachable', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const result = await provider.healthCheck();
    expect(result).toBe(false);
  });

  it('healthCheck() returns false when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const result = await provider.healthCheck();
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it('propagates errors thrown by generateObject()', async () => {
    mockGenerateObject.mockRejectedValue(new Error('rate limited'));
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({ model: 'anthropic/claude-sonnet-4', prompt: 'hi' }),
    ).rejects.toThrow('rate limited');
  });
});
