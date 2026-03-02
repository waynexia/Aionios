export const LLM_BACKENDS = ['mock', 'codex'] as const;

export type LlmBackend = (typeof LLM_BACKENDS)[number];

export interface PreferenceConfig {
  serverPort: number;
  serverDisableHmr: boolean;
  llmBackend: LlmBackend;
  codexCommand: string;
  codexTimeoutMs: number;
  llmStreamOutput: boolean;
  terminalShell: string;
}

export type PreferenceConfigPatch = Partial<PreferenceConfig>;
