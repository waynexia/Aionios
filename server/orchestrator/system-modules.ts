import { DIRECTORY_WINDOW_SOURCE } from './system-apps/directory';
import { EDITOR_WINDOW_SOURCE } from './system-apps/editor';
import { MEDIA_WINDOW_SOURCE } from './system-apps/media';
import { TERMINAL_WINDOW_SOURCE } from './system-apps/terminal';

const PREFERENCE_WINDOW_SOURCE = `
import { type FormEvent, useEffect, useMemo, useState } from 'react';

type PreferenceConfig = {
  llmBackend: 'mock' | 'codex';
  codexCommand: string;
  codexTimeoutMs: number;
  llmStreamOutput: boolean;
  terminalShell: string;
};

type PreferenceFormState = {
  llmBackend: 'mock' | 'codex';
  codexCommand: string;
  codexTimeoutMs: string;
  llmStreamOutput: boolean;
  terminalShell: string;
};

type PreferenceBridge = {
  read: () => Promise<PreferenceConfig>;
  update: (patch: PreferenceConfig) => Promise<PreferenceConfig>;
};

type WindowProps = {
  host: {
    preference: PreferenceBridge;
  };
  windowState: {
    title: string;
  };
};

function toFormState(config: PreferenceConfig): PreferenceFormState {
  return {
    llmBackend: config.llmBackend,
    codexCommand: config.codexCommand,
    codexTimeoutMs: String(config.codexTimeoutMs),
    llmStreamOutput: config.llmStreamOutput,
    terminalShell: config.terminalShell
  };
}

function toConfig(form: PreferenceFormState): PreferenceConfig {
  const timeout = Number.parseInt(form.codexTimeoutMs, 10);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error('Timeout must be a positive integer in milliseconds.');
  }
  return {
    llmBackend: form.llmBackend,
    codexCommand: form.codexCommand.trim(),
    codexTimeoutMs: timeout,
    llmStreamOutput: form.llmStreamOutput,
    terminalShell: form.terminalShell.trim()
  };
}

const INITIAL_FORM_STATE: PreferenceFormState = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check',
  codexTimeoutMs: '120000',
  llmStreamOutput: false,
  terminalShell: '/bin/sh'
};

export default function WindowApp({ host, windowState }: WindowProps) {
  const [form, setForm] = useState<PreferenceFormState>(INITIAL_FORM_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Loading preferences...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void host.preference
      .read()
      .then((config) => {
        if (!active) {
          return;
        }
        setForm(toFormState(config));
        setLoading(false);
        setError(null);
        setStatusMessage('Preferences loaded.');
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setLoading(false);
        setError((reason as Error).message);
        setStatusMessage('Unable to load preferences.');
      });
    return () => {
      active = false;
    };
  }, []);

  const backendHint = useMemo(
    () =>
      form.llmBackend === 'codex'
        ? 'Codex backend uses the configured command and timeout.'
        : 'Mock backend is deterministic and does not call an external model.',
    [form.llmBackend]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMessage('Saving preferences...');
    try {
      const updated = await host.preference.update(toConfig(form));
      setForm(toFormState(updated));
      setStatusMessage('Preferences saved.');
    } catch (reason) {
      setError((reason as Error).message);
      setStatusMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <header>
        <strong>{windowState.title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
          Configure server-owned runtime preferences for LLM and terminal.
        </p>
      </header>
      <form onSubmit={onSubmit} data-pref-form style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          <span>LLM backend</span>
          <select
            data-pref-field="llm-backend"
            value={form.llmBackend}
            disabled={loading || saving}
            onChange={(event) => setForm((state) => ({ ...state, llmBackend: event.target.value as 'mock' | 'codex' }))}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
              padding: '8px 10px'
            }}
          >
            <option value="mock">mock</option>
            <option value="codex">codex</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          <span>Codex command</span>
          <input
            data-pref-field="codex-command"
            value={form.codexCommand}
            disabled={loading || saving}
            onChange={(event) => setForm((state) => ({ ...state, codexCommand: event.target.value }))}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
              padding: '8px 10px'
            }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          <span>Codex timeout (ms)</span>
          <input
            data-pref-field="codex-timeout-ms"
            type="number"
            min={1}
            step={1}
            value={form.codexTimeoutMs}
            disabled={loading || saving}
            onChange={(event) => setForm((state) => ({ ...state, codexTimeoutMs: event.target.value }))}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
              padding: '8px 10px'
            }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span>Stream backend output (experimental)</span>
          <input
            data-pref-field="llm-stream-output"
            type="checkbox"
            checked={form.llmStreamOutput}
            disabled={loading || saving}
            onChange={(event) => setForm((state) => ({ ...state, llmStreamOutput: event.target.checked }))}
            style={{ justifySelf: 'start' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          <span>Terminal shell</span>
          <input
            data-pref-field="terminal-shell"
            value={form.terminalShell}
            disabled={loading || saving}
            onChange={(event) => setForm((state) => ({ ...state, terminalShell: event.target.value }))}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
              padding: '8px 10px'
            }}
          />
        </label>
        <button
          data-pref-action="save"
          type="submit"
          disabled={loading || saving}
          style={{
            justifySelf: 'start',
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: '#2563eb',
            color: '#f8fafc',
            cursor: loading || saving ? 'default' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save preferences'}
        </button>
      </form>
      <p data-pref-hint style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>
        {backendHint}
      </p>
      <p data-pref-status style={{ margin: 0, fontSize: 12, color: error ? '#fecaca' : '#bbf7d0' }}>
        {statusMessage}
      </p>
      {error ? (
        <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p>
      ) : null}
    </div>
  );
}
`.trim();

const SYSTEM_MODULE_SOURCES = {
  terminal: TERMINAL_WINDOW_SOURCE,
  preference: PREFERENCE_WINDOW_SOURCE,
  directory: DIRECTORY_WINDOW_SOURCE,
  media: MEDIA_WINDOW_SOURCE,
  editor: EDITOR_WINDOW_SOURCE
} as const;

export function isSystemApp(appId: string): boolean {
  return Object.hasOwn(SYSTEM_MODULE_SOURCES, appId);
}

export function getSystemModuleSource(appId: string): string | undefined {
  if (!isSystemApp(appId)) {
    return undefined;
  }
  return SYSTEM_MODULE_SOURCES[appId as keyof typeof SYSTEM_MODULE_SOURCES];
}
