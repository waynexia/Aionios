import { DIRECTORY_WINDOW_SOURCE } from './system-apps/directory';
import { EDITOR_WINDOW_SOURCE } from './system-apps/editor';
import { MEDIA_WINDOW_SOURCE } from './system-apps/media';

const TERMINAL_WINDOW_SOURCE = `
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type TerminalBridge = {
  start: () => Promise<void>;
  sendInput: (input: string) => Promise<void>;
  stop: () => Promise<void>;
};

type WindowProps = {
  host: {
    terminal: TerminalBridge;
  };
  windowState: {
    title: string;
    terminal?: {
      status: 'idle' | 'starting' | 'running' | 'closed' | 'error';
      buffer: string;
      shell?: string;
      cwd?: string;
      message?: string;
    };
  };
};

export default function WindowApp({ host, windowState }: WindowProps) {
  const [command, setCommand] = useState('');
  const outputRef = useRef<HTMLPreElement>(null);
  const terminalState = windowState.terminal;

  useEffect(() => {
    void host.terminal.start();
    return () => {
      void host.terminal.stop();
    };
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight
    });
  }, [terminalState?.buffer]);

  const statusLabel = useMemo(() => {
    if (!terminalState) {
      return 'starting';
    }
    return terminalState.status;
  }, [terminalState]);

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    await host.terminal.sendInput(trimmed + '\\n');
    setCommand('');
  }

  async function sendInterrupt() {
    await host.terminal.sendInput('\\u0003');
  }

  const shell = terminalState?.shell ?? 'shell';
  const cwd = terminalState?.cwd ?? '';
  const headerMeta = cwd ? shell + ' · ' + cwd : shell;
  const output = terminalState?.buffer ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{windowState.title}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>{headerMeta}</p>
        </div>
        <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: 'rgba(30,41,59,0.8)' }}>
          {statusLabel}
        </span>
      </header>
      <pre
        ref={outputRef}
        style={{
          margin: 0,
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.35)',
          background: '#020617',
          color: '#e2e8f0',
          padding: 12,
          fontSize: 12,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {output || 'Terminal session is starting...'}
      </pre>
      <form style={{ display: 'flex', gap: 8 }} onSubmit={submitCommand}>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Enter command (e.g. ls, pwd, node -v)"
          style={{
            flex: 1,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(2,6,23,0.8)',
            color: '#e2e8f0',
            padding: '8px 10px'
          }}
        />
        <button
          type="submit"
          style={{
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: '#1d4ed8',
            color: '#f8fafc',
            cursor: 'pointer'
          }}
        >
          Run
        </button>
        <button
          type="button"
          onClick={sendInterrupt}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.35)',
            padding: '8px 12px',
            background: 'transparent',
            color: '#f8fafc',
            cursor: 'pointer'
          }}
        >
          Ctrl+C
        </button>
      </form>
      {terminalState?.message ? (
        <p style={{ margin: 0, color: '#fecaca', fontSize: 12 }}>{terminalState.message}</p>
      ) : null}
    </div>
  );
}
`.trim();

const PREFERENCE_WINDOW_SOURCE = `
import { type FormEvent, useEffect, useMemo, useState } from 'react';

type PreferenceConfig = {
  llmBackend: 'mock' | 'codex';
  codexCommand: string;
  codexTimeoutMs: number;
  terminalShell: string;
};

type PreferenceFormState = {
  llmBackend: 'mock' | 'codex';
  codexCommand: string;
  codexTimeoutMs: string;
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
    terminalShell: form.terminalShell.trim()
  };
}

const INITIAL_FORM_STATE: PreferenceFormState = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check --output-last-message',
  codexTimeoutMs: '120000',
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
