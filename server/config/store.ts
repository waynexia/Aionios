import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from '@iarna/toml';
import {
  LLM_BACKENDS,
  type LlmBackend,
  type PreferenceConfig,
  type PreferenceConfigPatch
} from './types';

const DEFAULT_CODEX_COMMAND = 'codex exec --skip-git-repo-check';
const DEFAULT_CODEX_TIMEOUT_MS = 120_000;
const DEFAULT_LLM_STREAM_OUTPUT = false;
const DEFAULT_CONFIG_RELATIVE_PATH = '.aionios/preferences.toml';

interface PreferenceConfigStoreOptions {
  filePath?: string;
  defaults?: PreferenceConfig;
  environment?: NodeJS.ProcessEnv;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function parseTimeoutMs(value: unknown, fieldName: string): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return numericValue;
}

function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return value;
}

function parseBackend(value: unknown, fieldName: string): LlmBackend {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be one of ${LLM_BACKENDS.join(', ')}.`);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'mock' || normalized === 'codex') {
    return normalized;
  }
  throw new Error(`${fieldName} must be one of ${LLM_BACKENDS.join(', ')}.`);
}

function getTable(source: UnknownRecord, key: string): UnknownRecord {
  const value = source[key];
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${key} must be a TOML table.`);
  }
  return value;
}

function mergeConfig(base: PreferenceConfig, patch: PreferenceConfigPatch): PreferenceConfig {
  const merged = {
    ...base,
    ...patch
  };
  return {
    llmBackend: parseBackend(merged.llmBackend, 'llmBackend'),
    codexCommand: parseNonEmptyString(merged.codexCommand, 'codexCommand'),
    codexTimeoutMs: parseTimeoutMs(merged.codexTimeoutMs, 'codexTimeoutMs'),
    llmStreamOutput: parseBoolean(merged.llmStreamOutput, 'llmStreamOutput'),
    terminalShell: parseNonEmptyString(merged.terminalShell, 'terminalShell')
  };
}

function parseUpdatePatch(input: unknown): PreferenceConfigPatch {
  if (!isRecord(input)) {
    throw new Error('Preference update payload must be an object.');
  }

  const patch: PreferenceConfigPatch = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (key === 'llmBackend') {
      patch.llmBackend = parseBackend(value, key);
      continue;
    }
    if (key === 'codexCommand') {
      patch.codexCommand = parseNonEmptyString(value, key);
      continue;
    }
    if (key === 'codexTimeoutMs') {
      patch.codexTimeoutMs = parseTimeoutMs(value, key);
      continue;
    }
    if (key === 'llmStreamOutput') {
      patch.llmStreamOutput = parseBoolean(value, key);
      continue;
    }
    if (key === 'terminalShell') {
      patch.terminalShell = parseNonEmptyString(value, key);
      continue;
    }
    throw new Error(`Unknown preference field "${key}".`);
  }

  return patch;
}

function parseTomlConfig(rawToml: string): PreferenceConfigPatch {
  const parsed = parseToml(rawToml);
  if (!isRecord(parsed)) {
    throw new Error('Preference config file must contain a TOML object.');
  }

  for (const key of Object.keys(parsed)) {
    if (key !== 'llm' && key !== 'terminal') {
      throw new Error(`Unknown config section "${key}".`);
    }
  }

  const llm = getTable(parsed, 'llm');
  const terminal = getTable(parsed, 'terminal');

  for (const key of Object.keys(llm)) {
    if (key !== 'backend' && key !== 'codex_command' && key !== 'codex_timeout_ms' && key !== 'stream_output') {
      throw new Error(`Unknown config field "llm.${key}".`);
    }
  }

  for (const key of Object.keys(terminal)) {
    if (key !== 'shell') {
      throw new Error(`Unknown config field "terminal.${key}".`);
    }
  }

  const patch: PreferenceConfigPatch = {};
  if (llm.backend !== undefined) {
    patch.llmBackend = parseBackend(llm.backend, 'llm.backend');
  }
  if (llm.codex_command !== undefined) {
    patch.codexCommand = parseNonEmptyString(llm.codex_command, 'llm.codex_command');
  }
  if (llm.codex_timeout_ms !== undefined) {
    patch.codexTimeoutMs = parseTimeoutMs(llm.codex_timeout_ms, 'llm.codex_timeout_ms');
  }
  if (llm.stream_output !== undefined) {
    patch.llmStreamOutput = parseBoolean(llm.stream_output, 'llm.stream_output');
  }
  if (terminal.shell !== undefined) {
    patch.terminalShell = parseNonEmptyString(terminal.shell, 'terminal.shell');
  }

  return patch;
}

function serializeToml(config: PreferenceConfig) {
  return stringifyToml({
    llm: {
      backend: config.llmBackend,
      codex_command: config.codexCommand,
      codex_timeout_ms: config.codexTimeoutMs,
      stream_output: config.llmStreamOutput
    },
    terminal: {
      shell: config.terminalShell
    }
  });
}

function resolveEnvBackend(environment: NodeJS.ProcessEnv): LlmBackend {
  const configured = environment.AIONIOS_LLM_BACKEND?.trim().toLowerCase();
  if (configured === 'codex') {
    return 'codex';
  }
  return 'mock';
}

function resolveEnvStreamOutput(environment: NodeJS.ProcessEnv): boolean {
  const configured = environment.AIONIOS_LLM_STREAM_OUTPUT?.trim().toLowerCase();
  if (!configured) {
    return DEFAULT_LLM_STREAM_OUTPUT;
  }
  if (configured === '1' || configured === 'true' || configured === 'yes' || configured === 'on') {
    return true;
  }
  if (configured === '0' || configured === 'false' || configured === 'no' || configured === 'off') {
    return false;
  }
  return DEFAULT_LLM_STREAM_OUTPUT;
}

function resolveEnvTimeout(environment: NodeJS.ProcessEnv): number {
  const configured = environment.AIONIOS_CODEX_TIMEOUT_MS;
  if (configured === undefined) {
    return DEFAULT_CODEX_TIMEOUT_MS;
  }
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_CODEX_TIMEOUT_MS;
  }
  return parsed;
}

function resolveEnvCodexCommand(environment: NodeJS.ProcessEnv): string {
  const configured = environment.AIONIOS_CODEX_COMMAND?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_CODEX_COMMAND;
}

function resolveEnvShell(environment: NodeJS.ProcessEnv): string {
  const configured = environment.SHELL?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  if (process.platform === 'win32') {
    return environment.ComSpec?.trim() || 'cmd.exe';
  }

  const candidates = ['/bin/bash', '/usr/bin/bash', '/bin/sh'];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'sh';
}

export function resolvePreferenceDefaults(
  environment: NodeJS.ProcessEnv = process.env
): PreferenceConfig {
  return {
    llmBackend: resolveEnvBackend(environment),
    codexCommand: resolveEnvCodexCommand(environment),
    codexTimeoutMs: resolveEnvTimeout(environment),
    llmStreamOutput: resolveEnvStreamOutput(environment),
    terminalShell: resolveEnvShell(environment)
  };
}

export function resolvePreferenceConfigPath(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const configuredPath = environment.AIONIOS_CONFIG_PATH?.trim();
  if (!configuredPath) {
    return path.resolve(process.cwd(), DEFAULT_CONFIG_RELATIVE_PATH);
  }
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

export class PreferenceConfigStore {
  readonly filePath: string;
  private config: PreferenceConfig;

  constructor(options: PreferenceConfigStoreOptions = {}) {
    const environment = options.environment ?? process.env;
    this.config = options.defaults ?? resolvePreferenceDefaults(environment);
    this.filePath = options.filePath ?? resolvePreferenceConfigPath(environment);
  }

  getConfig(): PreferenceConfig {
    return { ...this.config };
  }

  async load(): Promise<PreferenceConfig> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    let loadedPatch: PreferenceConfigPatch = {};
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      loadedPatch = parseTomlConfig(content);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error;
      }
      await this.save();
      return this.getConfig();
    }
    this.config = mergeConfig(this.config, loadedPatch);
    return this.getConfig();
  }

  async update(input: unknown): Promise<PreferenceConfig> {
    const patch = parseUpdatePatch(input);
    this.config = mergeConfig(this.config, patch);
    await this.save();
    return this.getConfig();
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = serializeToml(this.config);
    await fs.writeFile(tempPath, serialized, 'utf8');
    try {
      await fs.rename(tempPath, this.filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }
}
