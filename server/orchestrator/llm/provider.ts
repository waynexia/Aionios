import type { LlmProvider } from '../types';
import { CodexExecProvider } from './codex-provider';
import { MockLlmProvider } from './mock-provider';

export function createLlmProvider(): LlmProvider {
  const backend = process.env.AIONIOS_LLM_BACKEND?.toLowerCase() ?? 'mock';
  if (backend === 'codex') {
    const command =
      process.env.AIONIOS_CODEX_COMMAND ?? 'codex exec --skip-git-repo-check --output-last-message';
    const timeoutMs = Number(process.env.AIONIOS_CODEX_TIMEOUT_MS ?? 120000);
    return new CodexExecProvider({
      command,
      timeoutMs
    });
  }
  return new MockLlmProvider();
}
