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

async function runCodexCommand(command: string, prompt: string, timeoutMs: number): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-codex-'));
  const outputPath = path.join(tmpDir, 'last-message.txt');

  try {
    const baseArgs = stripOutputLastMessageArgs(splitCommand(command));
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
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
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
    const raw = await runCodexCommand(this.options.command, prompt, this.options.timeoutMs);
    return {
      source: unwrapCodeBlock(raw),
      backend: 'codex'
    };
  }
}
