import { describe, expect, it } from 'vitest';
import type { PreferenceConfig } from '../../config';
import { CodexExecProvider } from './codex-provider';
import { MockLlmProvider } from './mock-provider';
import { createLlmProvider } from './provider';

function createConfig(overrides: Partial<PreferenceConfig> = {}): PreferenceConfig {
  return {
    llmBackend: 'mock',
    codexCommand: 'codex exec --skip-git-repo-check',
    codexTimeoutMs: 120_000,
    llmStreamOutput: false,
    terminalShell: '/bin/bash',
    ...overrides
  };
}

describe('createLlmProvider', () => {
  it('returns mock provider for mock backend', () => {
    const provider = createLlmProvider(createConfig({ llmBackend: 'mock' }));
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it('returns codex provider for codex backend', () => {
    const provider = createLlmProvider(createConfig({ llmBackend: 'codex' }));
    expect(provider).toBeInstanceOf(CodexExecProvider);
  });
});
