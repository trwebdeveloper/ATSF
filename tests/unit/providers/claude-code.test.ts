import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Use vi.hoisted() so variables are available inside vi.mock() factory
// ---------------------------------------------------------------------------
const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------
import { createClaudeCodeProvider } from '../../../src/providers/claude-code.js';

// ---------------------------------------------------------------------------
// Helper: build a fake ChildProcess
// ---------------------------------------------------------------------------
interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  killed: boolean;
  kill: (signal?: string) => boolean;
  pid?: number;
}

function makeChild(options: {
  stdoutData?: string;
  stderrData?: string;
  exitCode?: number;
  killed?: boolean;
} = {}): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = options.exitCode ?? 0;
  child.killed = options.killed ?? false;
  child.kill = vi.fn().mockReturnValue(true) as unknown as (signal?: string) => boolean;

  // Emit data and close asynchronously after a tick
  setImmediate(() => {
    if (options.stdoutData !== undefined) {
      child.stdout.emit('data', Buffer.from(options.stdoutData));
    }
    child.stdout.emit('end');

    if (options.stderrData !== undefined) {
      child.stderr.emit('data', Buffer.from(options.stderrData));
    }
    child.stderr.emit('end');

    // Emit both 'exit' and 'close' (mirrors Node.js ChildProcess behaviour)
    child.emit('exit', options.exitCode ?? 0, null);
    child.emit('close', options.exitCode ?? 0);
  });

  return child;
}

// Canonical JSON output from the claude CLI
function makeCliOutput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    result: 'Completed successfully.',
    usage: { input_tokens: 80, output_tokens: 40 },
    ...overrides,
  });
}

describe('ClaudeCodeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  it('has id "claude-code"', () => {
    const provider = createClaudeCodeProvider();
    expect(provider.id).toBe('claude-code');
  });

  it('has correct name', () => {
    const provider = createClaudeCodeProvider();
    expect(provider.name).toBe('Claude Code CLI');
  });

  it('has non-empty supportedModels list', () => {
    const provider = createClaudeCodeProvider();
    expect(provider.supportedModels.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // spawn() invocation
  // -------------------------------------------------------------------------

  it('spawns "claude" with stdio: ["ignore", "pipe", "pipe"]', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await provider.generate({ model: 'claude-sonnet-4', prompt: 'Hello' });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const spawnCall = mockSpawn.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(spawnCall[2].stdio).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('spawns with -p and --output-format json flags', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await provider.generate({ model: 'claude-sonnet-4', prompt: 'Describe a tree' });

    const spawnArgs = (mockSpawn.mock.calls[0] as [string, string[]])[1];
    expect(spawnArgs).toContain('-p');
    expect(spawnArgs).toContain('Describe a tree');
    expect(spawnArgs).toContain('--output-format');
    expect(spawnArgs).toContain('json');
  });

  it('includes --system-prompt flag when systemPrompt is provided', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await provider.generate({
      model: 'claude-sonnet-4',
      prompt: 'Task',
      systemPrompt: 'You are an expert.',
    });

    const spawnArgs = (mockSpawn.mock.calls[0] as [string, string[]])[1];
    expect(spawnArgs).toContain('--system-prompt');
    expect(spawnArgs).toContain('You are an expert.');
  });

  it('omits --system-prompt when systemPrompt is absent', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await provider.generate({ model: 'claude-sonnet-4', prompt: 'Task' });

    const spawnArgs = (mockSpawn.mock.calls[0] as [string, string[]])[1];
    expect(spawnArgs).not.toContain('--system-prompt');
  });

  // -------------------------------------------------------------------------
  // Successful response parsing
  // -------------------------------------------------------------------------

  it('returns content from parsed.result', async () => {
    const child = makeChild({ stdoutData: makeCliOutput({ result: 'Done!' }) });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    const response = await provider.generate({ model: 'claude-sonnet-4', prompt: 'go' });
    expect(response.content).toBe('Done!');
  });

  it('returns usage with promptTokens, completionTokens, totalTokens', async () => {
    const child = makeChild({
      stdoutData: makeCliOutput({ usage: { input_tokens: 120, output_tokens: 60 } }),
    });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    const response = await provider.generate({ model: 'claude-sonnet-4', prompt: 'go' });
    expect(response.usage.promptTokens).toBe(120);
    expect(response.usage.completionTokens).toBe(60);
    expect(response.usage.totalTokens).toBe(180);
  });

  it('falls back to zero token counts when usage field is absent', async () => {
    const child = makeChild({ stdoutData: JSON.stringify({ result: 'ok' }) });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    const response = await provider.generate({ model: 'claude-sonnet-4', prompt: 'go' });
    expect(response.usage.promptTokens).toBe(0);
    expect(response.usage.completionTokens).toBe(0);
    expect(response.usage.totalTokens).toBe(0);
  });

  it('returns finishReason "stop" and model "claude-code"', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    const response = await provider.generate({ model: 'claude-sonnet-4', prompt: 'go' });
    expect(response.finishReason).toBe('stop');
    expect(response.model).toBe('claude-code');
  });

  // -------------------------------------------------------------------------
  // Non-zero exit code — throws with stderr captured
  // -------------------------------------------------------------------------

  it('throws when child process exits with non-zero code', async () => {
    const child = makeChild({
      stdoutData: '',
      stderrData: 'API error: unauthorized',
      exitCode: 1,
    });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await expect(
      provider.generate({ model: 'claude-sonnet-4', prompt: 'go' }),
    ).rejects.toThrow(/1/);
  });

  it('includes stderr content in the thrown error message', async () => {
    const child = makeChild({
      stdoutData: '',
      stderrData: 'fatal: missing API key',
      exitCode: 2,
    });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    await expect(
      provider.generate({ model: 'claude-sonnet-4', prompt: 'go' }),
    ).rejects.toThrow(/fatal: missing API key/);
  });

  // -------------------------------------------------------------------------
  // AbortSignal — kills child process on abort
  // -------------------------------------------------------------------------

  it('kills child process with SIGTERM when AbortSignal fires', async () => {
    // Create a child that never closes on its own (no setImmediate)
    const child = new EventEmitter() as FakeChildProcess;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.killed = false;
    child.kill = vi.fn().mockImplementation(() => {
      child.killed = true;
      return true;
    }) as unknown as (signal?: string) => boolean;
    mockSpawn.mockReturnValue(child);

    const controller = new AbortController();
    const provider = createClaudeCodeProvider();

    // Start generate (it will hang waiting for child to close)
    const generatePromise = provider.generate({
      model: 'claude-sonnet-4',
      prompt: 'go',
      signal: controller.signal,
    });

    // Abort after a tick
    await Promise.resolve();
    controller.abort();

    // Now simulate the child closing after being killed
    setImmediate(() => {
      child.stdout.emit('end');
      child.stderr.emit('end');
      child.exitCode = 143; // SIGTERM exit code
      child.emit('close', 143);
    });

    // The promise should reject because exit code 143 != 0
    await expect(generatePromise).rejects.toThrow();

    // kill should have been called with SIGTERM
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('removes the abort listener after child exits normally', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    const removeSpy = vi.fn();
    const fakeSignal = {
      addEventListener: vi.fn((_event: string, _handler: () => void, _opts?: unknown) => {
        // Store handler but do nothing
      }),
      removeEventListener: removeSpy,
      aborted: false,
    } as unknown as AbortSignal;

    mockSpawn.mockReturnValue(child);
    const provider = createClaudeCodeProvider();
    await provider.generate({ model: 'claude-sonnet-4', prompt: 'go', signal: fakeSignal });

    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  // -------------------------------------------------------------------------
  // healthCheck()
  // -------------------------------------------------------------------------

  it('healthCheck() returns true when "claude --version" exits 0 with output', async () => {
    const child = makeChild({ stdoutData: 'claude 1.0.0\n' });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider();
    const result = await provider.healthCheck();
    expect(result).toBe(true);
  });

  it('healthCheck() returns false when spawn throws', async () => {
    mockSpawn.mockImplementation(() => { throw new Error('command not found'); });

    const provider = createClaudeCodeProvider();
    const result = await provider.healthCheck();
    expect(result).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Custom binary path
  // -------------------------------------------------------------------------

  it('uses custom binaryPath when provided', async () => {
    const child = makeChild({ stdoutData: makeCliOutput() });
    mockSpawn.mockReturnValue(child);

    const provider = createClaudeCodeProvider({ binaryPath: '/usr/local/bin/claude' });
    await provider.generate({ model: 'claude-sonnet-4', prompt: 'go' });

    const spawnCmd = (mockSpawn.mock.calls[0] as [string])[0];
    expect(spawnCmd).toBe('/usr/local/bin/claude');
  });
});
