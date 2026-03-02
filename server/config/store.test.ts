import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PreferenceConfigStore, resolvePreferenceDefaults } from './store';
import type { PreferenceConfig } from './types';

async function createTempConfigPath() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-config-test-'));
  return {
    tempDir,
    configPath: path.join(tempDir, 'preferences.toml')
  };
}

const createdDirs: string[] = [];

async function rememberTempDir() {
  const temp = await createTempConfigPath();
  createdDirs.push(temp.tempDir);
  return temp;
}

afterEach(async () => {
  for (const directory of createdDirs.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe('PreferenceConfigStore', () => {
  const defaults: PreferenceConfig = {
    llmBackend: 'mock',
    codexCommand: 'codex exec --skip-git-repo-check',
    codexTimeoutMs: 120_000,
    terminalShell: '/bin/sh'
  };

  it('writes defaults when config file does not exist', async () => {
    const { configPath } = await rememberTempDir();
    const store = new PreferenceConfigStore({
      filePath: configPath,
      defaults
    });

    const loaded = await store.load();
    const persisted = await fs.readFile(configPath, 'utf8');

    expect(loaded).toEqual(defaults);
    expect(persisted).toContain('[llm]');
    expect(persisted).toContain('backend = "mock"');
    expect(persisted).toContain('[terminal]');
  });

  it('loads and validates persisted TOML values', async () => {
    const { configPath } = await rememberTempDir();
    await fs.writeFile(
      configPath,
      [
        '[llm]',
        'backend = "codex"',
        'codex_command = "codex exec --model gpt-5"',
        'codex_timeout_ms = 64000',
        '',
        '[terminal]',
        'shell = "/usr/bin/zsh"',
        ''
      ].join('\n'),
      'utf8'
    );

    const store = new PreferenceConfigStore({
      filePath: configPath,
      defaults
    });

    const loaded = await store.load();

    expect(loaded).toEqual({
      llmBackend: 'codex',
      codexCommand: 'codex exec --model gpt-5',
      codexTimeoutMs: 64_000,
      terminalShell: '/usr/bin/zsh'
    });
  });

  it('updates and persists values through safe save', async () => {
    const { configPath, tempDir } = await rememberTempDir();
    const store = new PreferenceConfigStore({
      filePath: configPath,
      defaults
    });

    await store.load();
    const updated = await store.update({
      llmBackend: 'codex',
      codexTimeoutMs: 45_000,
      terminalShell: '/bin/bash'
    });
    const persisted = await fs.readFile(configPath, 'utf8');
    const directoryEntries = await fs.readdir(tempDir);

    expect(updated).toEqual({
      llmBackend: 'codex',
      codexCommand: defaults.codexCommand,
      codexTimeoutMs: 45_000,
      terminalShell: '/bin/bash'
    });
    expect(persisted).toContain('codex_timeout_ms = 45_000');
    expect(persisted).toContain('shell = "/bin/bash"');
    expect(directoryEntries.filter((entry) => entry.endsWith('.tmp'))).toHaveLength(0);
  });

  it('rejects invalid updates', async () => {
    const { configPath } = await rememberTempDir();
    const store = new PreferenceConfigStore({
      filePath: configPath,
      defaults
    });
    await store.load();

    await expect(store.update({ codexTimeoutMs: 0 })).rejects.toThrow(
      'codexTimeoutMs must be a positive integer.'
    );
    await expect(store.update({ unexpected: true })).rejects.toThrow(
      'Unknown preference field "unexpected".'
    );
  });
});

describe('resolvePreferenceDefaults', () => {
  it('reads environment overrides with fallback safety', () => {
    const resolved = resolvePreferenceDefaults({
      AIONIOS_LLM_BACKEND: 'CoDeX',
      AIONIOS_CODEX_COMMAND: 'codex exec --model gpt-5',
      AIONIOS_CODEX_TIMEOUT_MS: '90000',
      SHELL: '/usr/bin/fish'
    });
    expect(resolved).toEqual({
      llmBackend: 'codex',
      codexCommand: 'codex exec --model gpt-5',
      codexTimeoutMs: 90_000,
      terminalShell: '/usr/bin/fish'
    });
  });
});
