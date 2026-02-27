import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Use vi.hoisted() so variables are available inside vi.mock() factories
// ---------------------------------------------------------------------------
const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  generateObject: vi.fn(),
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
    // Default happy-path response for generateText
    mockGenerateText.mockResolvedValue({
      text: '{"answer": 42}',
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
  // generate() — calls generateText with correct params
  // -------------------------------------------------------------------------

  it('calls generateText() with model, prompt, and system prompt', async () => {
    const schema = z.object({ answer: z.number() });
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    const request: GenerateRequest = {
      model: 'anthropic/claude-sonnet-4',
      prompt: 'What is 6 * 7?',
      systemPrompt: 'You are a calculator.',
      schema,
    };

    await provider.generate(request);

    expect(mockGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    // Prompt includes JSON instruction when schema is present
    expect(callArgs.prompt).toContain('What is 6 * 7?');
    expect(callArgs.system).toBe('You are a calculator.');
    expect(callArgs.model).toBeDefined();
  });

  it('calls generateText() without system when systemPrompt is absent', async () => {
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });

    await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Hello',
    });

    const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
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

    const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0.5);
    expect(callArgs.maxTokens).toBe(256);
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

    expect(response.content).toContain('42');
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
    mockGenerateText.mockResolvedValue({
      text: '{}',
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
  // generate() without schema
  // -------------------------------------------------------------------------

  it('returns text content when no schema is provided', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'Hello there!',
      finishReason: 'stop',
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    });

    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'Say hello',
    });

    expect(response.content).toBe('Hello there!');
    expect(response.object).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // generate() — JSON extraction from model responses
  // -------------------------------------------------------------------------

  it('extracts JSON from markdown code blocks', async () => {
    mockGenerateText.mockResolvedValue({
      text: '```json\n{"answer": 42}\n```',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    });

    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      model: 'anthropic/claude-sonnet-4',
      prompt: 'What is 6 * 7?',
      schema: z.object({ answer: z.number() }),
    });

    expect(response.object).toEqual({ answer: 42 });
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

  it('propagates errors thrown by generateText()', async () => {
    mockGenerateText.mockRejectedValue(new Error('rate limited'));
    const provider = createOpenRouterProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({ model: 'anthropic/claude-sonnet-4', prompt: 'hi' }),
    ).rejects.toThrow('rate limited');
  });
});
