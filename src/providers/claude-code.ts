import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { ProviderAdapter, GenerateRequest, GenerateResponse } from './types.js';

const SUPPORTED_MODELS = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'] as const;

export interface ClaudeCodeProviderOptions {
  /** Path to the claude CLI binary. Defaults to "claude" (resolved via PATH). */
  binaryPath?: string;
}

/**
 * Collects all data events from a readable stream into a single string.
 */
function collectStream(stream: NodeJS.EventEmitter): Promise<string> {
  return new Promise<string>(resolve => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

/**
 * Waits for the child process to emit 'close' and resolves with the exit code.
 */
function waitForClose(child: ChildProcess): Promise<number | null> {
  return new Promise<number | null>(resolve => {
    child.on('close', (code: number | null) => {
      resolve(code);
    });
  });
}

/**
 * ProviderAdapter that invokes the Claude Code CLI as a child process.
 *
 * Per spec Section 4.4: uses child_process.spawn with:
 *   stdio: ['ignore', 'pipe', 'pipe']
 *
 * Per spec Section 4.5: providers do NO resilience wrapping.
 */
class ClaudeCodeProvider implements ProviderAdapter {
  readonly id = 'claude-code';
  readonly name = 'Claude Code CLI';
  readonly supportedModels: readonly string[] = SUPPORTED_MODELS;

  private readonly _binaryPath: string;

  constructor(options: ClaudeCodeProviderOptions = {}) {
    this._binaryPath = options.binaryPath ?? 'claude';
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const args: string[] = [
      '-p', request.prompt,
      '--output-format', 'json',
    ];

    if (request.systemPrompt !== undefined) {
      args.push('--system-prompt', request.systemPrompt);
    }

    const child = spawn(this._binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Propagate AbortSignal to kill the child process
    if (request.signal) {
      const onAbort = (): void => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      };
      request.signal.addEventListener('abort', onAbort, { once: true });
      child.on('exit', () => {
        request.signal!.removeEventListener('abort', onAbort);
      });
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      collectStream(child.stdout!),
      collectStream(child.stderr!),
      waitForClose(child),
    ]);

    if (exitCode !== 0) {
      throw new Error(
        `Claude Code CLI exited with code ${exitCode}: ${stderr}`,
      );
    }

    const parsed = JSON.parse(stdout) as {
      result: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const promptTokens = parsed.usage?.input_tokens ?? 0;
    const completionTokens = parsed.usage?.output_tokens ?? 0;

    return {
      content: parsed.result,
      model: 'claude-code',
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const child = spawn(this._binaryPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const [output] = await Promise.all([
        collectStream(child.stdout!),
        waitForClose(child),
      ]);
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create a ClaudeCodeProvider.
 */
export function createClaudeCodeProvider(
  options: ClaudeCodeProviderOptions = {},
): ProviderAdapter {
  return new ClaudeCodeProvider(options);
}
