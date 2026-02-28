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

export function getSystemModuleSource(appId: string): string | undefined {
  if (appId === 'terminal') {
    return TERMINAL_WINDOW_SOURCE;
  }
  return undefined;
}
