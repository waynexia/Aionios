import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGenerationPrompt } from '../context';
import type { GenerateRequest, GenerateResult, LlmProvider } from '../types';
import { unwrapCodeBlock } from './utils';

export interface CodexProviderOptions {
  command: string;
  timeoutMs: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function splitCommand(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasCurrent = false;

  const pushCurrent = () => {
    if (!hasCurrent) {
      return;
    }
    args.push(current);
    current = '';
    hasCurrent = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === undefined) {
      break;
    }
    const next = command[index + 1];

    if (quote) {
      if (char === quote) {
        quote = null;
        hasCurrent = true;
        continue;
      }

      if (char === '\\' && quote === '"') {
        if (next === '"' || next === '\\') {
          current += next;
          hasCurrent = true;
          index += 1;
          continue;
        }
        current += char;
        hasCurrent = true;
        continue;
      }

      current += char;
      hasCurrent = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasCurrent = true;
      continue;
    }

    if (char.trim().length === 0) {
      pushCurrent();
      continue;
    }

    if (char === '\\') {
      if (
        next !== undefined &&
        (next.trim().length === 0 || next === '"' || next === "'" || next === '\\')
      ) {
        current += next;
        hasCurrent = true;
        index += 1;
        continue;
      }
      current += char;
      hasCurrent = true;
      continue;
    }

    current += char;
    hasCurrent = true;
  }

  pushCurrent();
  return args;
}

function stripOutputLastMessageArgs(args: string[]): string[] {
  const next: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--output-last-message' || token === '-o') {
      const possibleValue = args[index + 1];
      if (possibleValue !== undefined && !possibleValue.startsWith('-')) {
        index += 1;
      }
      continue;
    }
    if (token.startsWith('--output-last-message=')) {
      continue;
    }
    next.push(token);
  }
  return next;
}

function ensureJsonFlag(args: string[], enabled: boolean) {
  if (!enabled) {
    return args;
  }
  if (args.includes('--json')) {
    return args;
  }
  return [...args, '--json'];
}

function redactEmbeddedPreviousSource(text: string) {
  const startMarker = 'Previous module source:';
  const endMarker = 'Return only TSX module code.';
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) {
    return text;
  }
  const endIndex = text.indexOf(endMarker, startIndex);
  const redacted = `${startMarker}\n[redacted]\n\n`;
  if (endIndex === -1) {
    return `${text.slice(0, startIndex)}${redacted}`.trimEnd();
  }
  return `${text.slice(0, startIndex)}${redacted}${text.slice(endIndex)}`.trimEnd();
}

function summarizeCodexJsonEvent(event: unknown): string | undefined {
  if (!isRecord(event) || typeof event.type !== 'string') {
    return undefined;
  }

  if (event.type === 'thread.started') {
    const threadId = typeof event.thread_id === 'string' ? event.thread_id : 'unknown';
    return `[codex] thread started: ${threadId}\n`;
  }

  if (event.type === 'turn.started') {
    return '[codex] turn started\n';
  }

  if (event.type === 'turn.completed') {
    const usage = event.usage;
    if (!isRecord(usage)) {
      return '[codex] turn completed\n';
    }
    const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined;
    const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined;
    const cachedTokens =
      typeof usage.cached_input_tokens === 'number' ? usage.cached_input_tokens : undefined;
    const pieces = [
      inputTokens !== undefined ? `in=${String(inputTokens)}` : null,
      cachedTokens !== undefined ? `cached=${String(cachedTokens)}` : null,
      outputTokens !== undefined ? `out=${String(outputTokens)}` : null
    ].filter(Boolean);
    return pieces.length > 0 ? `[codex] turn completed (${pieces.join(', ')})\n` : '[codex] turn completed\n';
  }

  if (event.type === 'item.completed') {
    const item = event.item;
    if (!isRecord(item)) {
      return '[codex] item completed\n';
    }
    const itemType = typeof item.type === 'string' ? item.type : 'unknown';
    const textLength = typeof item.text === 'string' ? item.text.length : undefined;
    const suffix = textLength !== undefined ? ` (${String(textLength)} chars)` : '';
    return `[codex] item completed: ${itemType}${suffix}\n`;
  }

  return `[codex] ${event.type}\n`;
}

async function runCodexCommand(
  command: string,
  prompt: string,
  timeoutMs: number,
  onOutputChunk?: (event: { stream: 'stdout' | 'stderr'; chunk: string }) => void
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-codex-'));
  const outputPath = path.join(tmpDir, 'last-message.txt');

  try {
    const streaming = typeof onOutputChunk === 'function';
    const baseArgs = ensureJsonFlag(stripOutputLastMessageArgs(splitCommand(command)), streaming);
    if (baseArgs.length === 0) {
      throw new Error('codexCommand must not be empty');
    }
    const args = [...baseArgs, '--output-last-message', outputPath];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let stdoutJsonBuffer = '';
      const emitChunk = (event: { stream: 'stdout' | 'stderr'; chunk: string }) => {
        try {
          onOutputChunk?.(event);
        } catch {
          // ignore consumer errors
        }
      };
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (!streaming) {
          emitChunk({ stream: 'stdout', chunk: text });
          return;
        }
        stdoutJsonBuffer += text;
        while (true) {
          const newlineIndex = stdoutJsonBuffer.indexOf('\n');
          if (newlineIndex === -1) {
            break;
          }
          const line = stdoutJsonBuffer.slice(0, newlineIndex).replace(/\r$/, '');
          stdoutJsonBuffer = stdoutJsonBuffer.slice(newlineIndex + 1);
          if (!line.trim()) {
            continue;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          const summary = summarizeCodexJsonEvent(parsed);
          if (!summary) {
            continue;
          }
          emitChunk({ stream: 'stdout', chunk: summary });
        }
      });
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        emitChunk({ stream: 'stderr', chunk: streaming ? redactEmbeddedPreviousSource(text) : text });
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`codex exec failed with code ${code}: ${stderr || stdout}`));
          return;
        }
        resolve();
      });

      child.stdin.end(prompt);
    });

    return await fs.readFile(outputPath, 'utf8');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export class CodexExecProvider implements LlmProvider {
  constructor(private readonly options: CodexProviderOptions) {}

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const prompt = buildGenerationPrompt(request);
    const raw = await runCodexCommand(
      this.options.command,
      prompt,
      this.options.timeoutMs,
      request.onOutputChunk
    );
    return {
      source: unwrapCodeBlock(raw),
      backend: 'codex'
    };
  }
}
