import { spawn } from 'node:child_process';
import { buildGenerationPrompt } from '../context';
import type { GenerateRequest, GenerateResult, LlmProvider } from '../types';
import { unwrapCodeBlock } from './utils';

export interface CodexProviderOptions {
  command: string;
  timeoutMs: number;
}

function runCodexCommand(command: string, prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
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
      resolve(stdout);
    });

    child.stdin.end(prompt);
  });
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
