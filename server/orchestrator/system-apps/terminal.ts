export const TERMINAL_WINDOW_SOURCE = `
import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

type WindowProps = {
  host: {
    sessionId: string;
    windowId: string;
  };
  windowState: {
    title: string;
  };
};

type TerminalServerMessage =
  | { type: 'ready'; shell: string; cwd: string; cols: number; rows: number }
  | { type: 'data'; data: string }
  | { type: 'error'; message: string };

function resolveWebSocketUrl(host: WindowProps['host']) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const encodedSession = encodeURIComponent(host.sessionId);
  const encodedWindow = encodeURIComponent(host.windowId);
  return \`\${protocol}://\${window.location.host}/api/sessions/\${encodedSession}/windows/\${encodedWindow}/terminal/ws\`;
}

function resolveThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const fallbackBackground = '#020617';
  const fallbackForeground = '#e2e8f0';
  const background = styles.backgroundColor && styles.backgroundColor !== 'rgba(0, 0, 0, 0)'
    ? styles.backgroundColor
    : fallbackBackground;
  return {
    background,
    foreground: styles.color || fallbackForeground,
    selectionBackground: 'rgba(148, 163, 184, 0.35)'
  };
}

function ensureTestRegistry() {
  const registryKey = '__AIONIOS_XTERM__';
  const registry = (globalThis as any)[registryKey] as Record<string, Terminal> | undefined;
  if (registry) {
    return registry;
  }
  const created: Record<string, Terminal> = {};
  (globalThis as any)[registryKey] = created;
  return created;
}

export default function WindowApp({ host, windowState }: WindowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const startedRef = useRef(false);
  const pendingInputRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error' | 'closed'>('connecting');
  const [shell, setShell] = useState<string>('shell');
  const [cwd, setCwd] = useState<string>('');

  const wsUrl = useMemo(() => resolveWebSocketUrl(host), [host.sessionId, host.windowId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const { background, foreground, selectionBackground } = resolveThemeColors();
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: {
        background,
        foreground,
        cursor: foreground,
        selectionBackground
      },
      scrollback: 5000,
      convertEol: false
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(container);
    terminal.focus();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const registry = ensureTestRegistry();
    registry[host.windowId] = terminal;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    const send = (payload: unknown) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(payload));
    };

    const flushInput = () => {
      flushTimerRef.current = null;
      const pending = pendingInputRef.current;
      if (!pending) {
        return;
      }
      pendingInputRef.current = '';
      send({ type: 'input', data: pending });
    };

    const scheduleFlushInput = () => {
      if (flushTimerRef.current !== null) {
        return;
      }
      flushTimerRef.current = window.setTimeout(flushInput, 12);
    };

    const dataDisposable = terminal.onData((data) => {
      pendingInputRef.current += data;
      scheduleFlushInput();
    });

    const resizeTerminal = () => {
      const activeTerminal = terminalRef.current;
      const activeFitAddon = fitAddonRef.current;
      if (!activeTerminal || !activeFitAddon) {
        return;
      }
      activeFitAddon.fit();
      const next = { cols: activeTerminal.cols, rows: activeTerminal.rows };
      const previous = lastSizeRef.current;
      if (!previous || previous.cols !== next.cols || previous.rows !== next.rows) {
        lastSizeRef.current = next;
        if (startedRef.current) {
          send({ type: 'resize', cols: next.cols, rows: next.rows });
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(resizeTerminal);
    });
    resizeObserver.observe(container);
    requestAnimationFrame(resizeTerminal);

    socket.addEventListener('open', () => {
      setStatus('connecting');
      fitAddon.fit();
      const size = { cols: terminal.cols || 80, rows: terminal.rows || 24 };
      lastSizeRef.current = size;
      startedRef.current = true;
      send({ type: 'start', cols: size.cols, rows: size.rows });
    });

    socket.addEventListener('message', (event) => {
      let message: TerminalServerMessage | null = null;
      try {
        message = JSON.parse(String(event.data)) as TerminalServerMessage;
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') {
        return;
      }
      if (message.type === 'ready') {
        setShell(message.shell);
        setCwd(message.cwd);
        setStatus('ready');
        return;
      }
      if (message.type === 'data') {
        if (message.data) {
          terminal.write(message.data);
        }
        return;
      }
      if (message.type === 'error') {
        setStatus('error');
        terminal.writeln(\`\\r\\n[Aionios Terminal Error] \${message.message}\\r\\n\`);
      }
    });

    socket.addEventListener('close', () => {
      setStatus('closed');
    });

    socket.addEventListener('error', () => {
      setStatus('error');
    });

    const handlePointerDown = () => {
      terminal.focus();
    };
    container.addEventListener('pointerdown', handlePointerDown);

    return () => {
      startedRef.current = false;
      container.removeEventListener('pointerdown', handlePointerDown);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushInput();
      try {
        send({ type: 'stop' });
      } catch {
        // ignore
      }
      try {
        socket.close();
      } catch {
        // ignore
      }
      webLinksAddon.dispose();
      fitAddon.dispose();
      terminal.dispose();
      delete registry[host.windowId];
    };
  }, [host.windowId, wsUrl]);

  const headerMeta = cwd ? shell + ' · ' + cwd : shell;

  return (
    <div data-terminal-app style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{windowState.title}</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>{headerMeta}</p>
        </div>
        <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: 'rgba(30,41,59,0.8)' }}>
          {status}
        </span>
      </header>
      <div
        data-terminal-xterm
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.35)',
          background: '#020617'
        }}
      />
      <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
        Tip: use your normal shell keybindings (history, Ctrl+C, Ctrl+R, etc). Resize the window to update the PTY.
      </p>
    </div>
  );
}
`.trim();
