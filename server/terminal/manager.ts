import * as pty from 'node-pty';
import os from 'node:os';
import type { PreferenceConfig } from '../config';
import type {
  TerminalExitEvent,
  TerminalStatusEvent
} from '../orchestrator/types';

interface TerminalSession {
  key: string;
  sessionId: string;
  windowId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  transcript: string;
  process: pty.IPty;
  subscribers: Set<(chunk: string) => void>;
}

interface TerminalSessionMetadata {
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: 'running';
}

function buildSessionKey(sessionId: string, windowId: string) {
  return `${sessionId}:${windowId}`;
}

function resolveDefaultShell() {
  if (process.env.SHELL) {
    return process.env.SHELL;
  }
  if (process.platform === 'darwin') {
    return '/bin/zsh';
  }
  return '/bin/bash';
}

function clampPositiveInt(value: number | undefined, fallback: number) {
  if (typeof value !== 'number') {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : fallback;
}

function appendTranscript(current: string, chunk: string, limit = 120_000) {
  if (!chunk) {
    return current;
  }
  const next = `${current}${chunk}`;
  if (next.length <= limit) {
    return next;
  }
  return next.slice(next.length - limit);
}

function resolveSignalName(signal: number | undefined): NodeJS.Signals | null {
  if (typeof signal !== 'number') {
    return null;
  }
  const signals = os.constants.signals as Record<string, number | undefined>;
  for (const [name, value] of Object.entries(signals)) {
    if (value === signal) {
      return name as NodeJS.Signals;
    }
  }
  return null;
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly publish: (
      event: TerminalStatusEvent | TerminalExitEvent
    ) => void,
    private readonly readConfig: () => PreferenceConfig
  ) {}

  start(
    sessionId: string,
    windowId: string,
    options?: { cols?: number; rows?: number }
  ): TerminalSessionMetadata {
    const key = buildSessionKey(sessionId, windowId);
    const existing = this.sessions.get(key);
    if (existing) {
      if (this.isSessionActive(existing)) {
        const nextCols = clampPositiveInt(options?.cols, existing.cols);
        const nextRows = clampPositiveInt(options?.rows, existing.rows);
        if (nextCols !== existing.cols || nextRows !== existing.rows) {
          existing.cols = nextCols;
          existing.rows = nextRows;
          try {
            existing.process.resize(nextCols, nextRows);
          } catch {
            // ignore resize failures for already-running sessions
          }
        }
        return {
          shell: existing.shell,
          cwd: existing.cwd,
          cols: existing.cols,
          rows: existing.rows,
          status: 'running'
        };
      }
      this.sessions.delete(key);
    }

    const shell = this.readConfig().terminalShell || resolveDefaultShell();
    const cwd = process.cwd();
    const cols = clampPositiveInt(options?.cols, 80);
    const rows = clampPositiveInt(options?.rows, 24);
    this.publish({
      type: 'terminal-status',
      sessionId,
      windowId,
      status: 'starting',
      shell,
      cwd
    });

    try {
      const terminal = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: process.env
      });

      const session: TerminalSession = {
        key,
        sessionId,
        windowId,
        shell,
        cwd,
        cols,
        rows,
        transcript: '',
        process: terminal,
        subscribers: new Set()
      };
      this.sessions.set(key, session);

      terminal.onData((chunk) => {
        const active = this.sessions.get(key);
        if (!active || active.process !== terminal) {
          return;
        }
        active.transcript = appendTranscript(active.transcript, chunk);
        for (const subscriber of active.subscribers) {
          subscriber(chunk);
        }
      });
      terminal.onExit(({ exitCode, signal }) => {
        const signalName = resolveSignalName(signal);
        const active = this.sessions.get(key);
        if (!active || active.process !== terminal) {
          return;
        }
        this.sessions.delete(key);
        for (const subscriber of active.subscribers) {
          try {
            subscriber(
              signalName
                ? `\r\n[Terminal exited via signal ${signalName}]\r\n`
                : signal
                  ? `\r\n[Terminal exited via signal ${String(signal)}]\r\n`
                  : `\r\n[Terminal exited with code ${String(exitCode)}]\r\n`
            );
          } catch {
            // ignore subscriber failure
          }
        }
        active.subscribers.clear();
        this.publish({
          type: 'terminal-exit',
          sessionId,
          windowId,
          code: typeof exitCode === 'number' ? exitCode : null,
          signal: signalName
        });
        this.publish({
          type: 'terminal-status',
          sessionId,
          windowId,
          status: 'closed',
          shell,
          cwd,
          message: buildCloseMessage(exitCode ?? null, signalName)
        });
      });

      this.publish({
        type: 'terminal-status',
        sessionId,
        windowId,
        status: 'running',
        shell,
        cwd
      });

      return {
        shell,
        cwd,
        cols,
        rows,
        status: 'running'
      };
    } catch (error) {
      const message = (error as Error).message;
      this.publish({
        type: 'terminal-status',
        sessionId,
        windowId,
        status: 'error',
        shell,
        cwd,
        message
      });
      throw error;
    }
  }

  write(sessionId: string, windowId: string, input: string) {
    const key = buildSessionKey(sessionId, windowId);
    const session = this.sessions.get(key);
    if (!session) {
      throw new Error('Terminal session is not running.');
    }
    session.process.write(input);
  }

  resize(sessionId: string, windowId: string, cols: number, rows: number) {
    const key = buildSessionKey(sessionId, windowId);
    const session = this.sessions.get(key);
    if (!session) {
      throw new Error('Terminal session is not running.');
    }
    const nextCols = clampPositiveInt(cols, session.cols);
    const nextRows = clampPositiveInt(rows, session.rows);
    session.cols = nextCols;
    session.rows = nextRows;
    session.process.resize(nextCols, nextRows);
  }

  subscribe(sessionId: string, windowId: string, onChunk: (chunk: string) => void) {
    const key = buildSessionKey(sessionId, windowId);
    const session = this.sessions.get(key);
    if (!session) {
      throw new Error('Terminal session is not running.');
    }
    session.subscribers.add(onChunk);
    if (session.transcript) {
      onChunk(session.transcript);
    }
    return () => {
      const active = this.sessions.get(key);
      if (!active) {
        return;
      }
      active.subscribers.delete(onChunk);
    };
  }

  close(sessionId: string, windowId: string) {
    const key = buildSessionKey(sessionId, windowId);
    const session = this.sessions.get(key);
    if (!session) {
      return false;
    }
    if (!this.isSessionActive(session)) {
      this.sessions.delete(key);
      return false;
    }
    try {
      session.process.kill('SIGTERM');
      return true;
    } catch {
      this.sessions.delete(key);
      return false;
    }
  }

  private isSessionActive(session: TerminalSession) {
    return (
      typeof session.process.pid === 'number' &&
      session.process.pid > 0 &&
      this.sessions.get(session.key)?.process === session.process
    );
  }
}

function buildCloseMessage(code: number | null, signal: NodeJS.Signals | null) {
  if (signal) {
    return `Terminal exited via signal ${signal}.`;
  }
  if (typeof code === 'number') {
    return `Terminal exited with code ${code}.`;
  }
  return 'Terminal closed.';
}
