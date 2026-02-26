import type { ProviderAdapter, GenerateRequest, GenerateResponse } from '../../src/providers/types.js';

/**
 * A mock ProviderAdapter that returns deterministic responses for testing.
 */
export class MockProvider implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportedModels: readonly string[];

  private _response: GenerateResponse;
  private _healthResult: boolean;
  private _callCount = 0;
  private _lastRequest: GenerateRequest | undefined;

  constructor(options: {
    id?: string;
    name?: string;
    supportedModels?: string[];
    response?: Partial<GenerateResponse>;
    healthy?: boolean;
  } = {}) {
    this.id = options.id ?? 'mock-provider';
    this.name = options.name ?? 'Mock Provider';
    this.supportedModels = options.supportedModels ?? ['mock-model'];
    this._healthResult = options.healthy ?? true;
    this._response = {
      content: options.response?.content ?? 'mock response',
      object: options.response?.object,
      model: options.response?.model ?? 'mock-model',
      finishReason: options.response?.finishReason ?? 'stop',
      usage: options.response?.usage ?? {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this._callCount += 1;
    this._lastRequest = request;
    return { ...this._response };
  }

  async healthCheck(): Promise<boolean> {
    return this._healthResult;
  }

  /** Number of times generate() was called. */
  get callCount(): number {
    return this._callCount;
  }

  /** The last GenerateRequest passed to generate(). */
  get lastRequest(): GenerateRequest | undefined {
    return this._lastRequest;
  }

  /** Override the response for subsequent calls. */
  setResponse(response: Partial<GenerateResponse>): void {
    this._response = { ...this._response, ...response };
  }

  /** Override the health result. */
  setHealthy(healthy: boolean): void {
    this._healthResult = healthy;
  }

  /** Reset call tracking. */
  reset(): void {
    this._callCount = 0;
    this._lastRequest = undefined;
  }
}

/**
 * Create a MockProvider with the given id and optional options.
 */
export function createMockProvider(
  id: string,
  options: Omit<ConstructorParameters<typeof MockProvider>[0], 'id'> = {},
): MockProvider {
  return new MockProvider({ id, ...options });
}
