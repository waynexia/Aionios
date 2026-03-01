import type { PreferenceConfig } from '../../config';
import type { LlmProvider } from '../types';
import { CodexExecProvider } from './codex-provider';
import { MockLlmProvider } from './mock-provider';

export function createLlmProvider(config: PreferenceConfig): LlmProvider {
  if (config.llmBackend === 'codex') {
    return new CodexExecProvider({
      command: config.codexCommand,
      timeoutMs: config.codexTimeoutMs
    });
  }
  return new MockLlmProvider();
}
