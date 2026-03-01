import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import type { PreferenceConfig } from '../config';
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalStatusEvent
} from '../orchestrator/types';

interface TerminalSession {
  key: string;
  sessionId: string;
  windowId: string;
  shell: string;
  cwd: string;
  process: ChildProcessWithoutNullStreams;
}

interface TerminalSessionMetadata {
  shell: string;
  cwd: string;
  status: 'running';
}

function buildSessionKey(sessionId: string, windowId: string) {
  return `${sessionId}:${windowId}`;
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly publish: (
      event: TerminalStatusEvent | TerminalOutputEvent | TerminalExitEvent
    ) => void,
    private readonly readConfig: () => PreferenceConfig
  ) {}

  start(sessionId: string, windowId: string): TerminalSessionMetadata {
    const key = buildSessionKey(sessionId, windowId);
    const existing = this.sessions.get(key);
    if (existing) {
      if (this.isSessionActive(existing)) {
        return {
          shell: existing.shell,
          cwd: existing.cwd,
          status: 'running'
        };
      }
      this.sessions.delete(key);
    }

    const shell = this.readConfig().terminalShell;
    const cwd = process.cwd();
    this.publish({
      type: 'terminal-status',
      sessionId,
      windowId,
      status: 'starting',
      shell,
      cwd
    });

    try {
      const child = spawn(shell, [], {
        cwd,
        env: process.env,
        stdio: 'pipe'
      });

      const session: TerminalSession = {
        key,
        sessionId,
        windowId,
        shell,
        cwd,
        process: child
      };
      this.sessions.set(key, session);

      child.stdout.on('data', (chunk: Buffer) => {
        this.publish({
          type: 'terminal-output',
          sessionId,
          windowId,
          stream: 'stdout',
          chunk: chunk.toString('utf8')
        });
      });
      child.stderr.on('data', (chunk: Buffer) => {
        this.publish({
          type: 'terminal-output',
          sessionId,
          windowId,
          stream: 'stderr',
          chunk: chunk.toString('utf8')
        });
      });
      child.on('error', (error) => {
        this.clearSession(key, child);
        this.publish({
          type: 'terminal-status',
          sessionId,
          windowId,
          status: 'error',
          shell,
          cwd,
          message: error.message
        });
      });
      child.on('close', (code, signal) => {
        this.clearSession(key, child);
        this.publish({
          type: 'terminal-exit',
          sessionId,
          windowId,
          code,
          signal
        });
        this.publish({
          type: 'terminal-status',
          sessionId,
          windowId,
          status: 'closed',
          shell,
          cwd,
          message: buildCloseMessage(code, signal)
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

      this.write(sessionId, windowId, buildInitialBanner());
      return {
        shell,
        cwd,
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
    if (!session.process.stdin.writable) {
      throw new Error('Terminal stdin is not writable.');
    }
    session.process.stdin.write(input);
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
      const closed = session.process.kill('SIGTERM');
      if (!closed) {
        this.sessions.delete(key);
      }
      return closed;
    } catch {
      this.sessions.delete(key);
      return false;
    }
  }

  private isSessionActive(session: TerminalSession) {
    return (
      typeof session.process.pid === 'number' &&
      session.process.exitCode === null &&
      session.process.signalCode === null &&
      !session.process.killed
    );
  }

  private clearSession(key: string, target: ChildProcessWithoutNullStreams) {
    const session = this.sessions.get(key);
    if (session?.process === target) {
      this.sessions.delete(key);
    }
  }
}

function buildInitialBanner() {
  const hostInfo = `${os.userInfo().username}@${os.hostname()}`;
  const cwd = process.cwd();
  return `echo "[Aionios Terminal] ${hostInfo}" && echo "cwd: ${cwd}" && echo "Type commands and press Run."\n`;
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
