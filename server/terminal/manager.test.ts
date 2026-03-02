import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPty } from 'node-pty';
import type { PreferenceConfig } from '../config';
import type {
  TerminalExitEvent,
  TerminalStatusEvent
} from '../orchestrator/types';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock('node-pty', () => ({
  spawn: spawnMock
}));

import { TerminalManager } from './manager';

type TerminalEvent = TerminalStatusEvent | TerminalExitEvent;
const preferenceConfig: PreferenceConfig = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check',
  codexTimeoutMs: 120_000,
  llmStreamOutput: false,
  terminalShell: '/bin/bash'
};

function createEvent<T>() {
  const listeners = new Set<(data: T) => void>();
  const event = (listener: (data: T) => void) => {
    listeners.add(listener);
    return {
      dispose: () => listeners.delete(listener)
    };
  };
  const fire = (data: T) => {
    for (const listener of listeners) {
      listener(data);
    }
  };
  return { event, fire };
}

function createMockPty(pid = 1001) {
  const dataEvent = createEvent<string>();
  const exitEvent = createEvent<{ exitCode: number; signal?: number }>();
  const runtime: IPty & {
    __fireData: (chunk: string) => void;
    __fireExit: (payload: { exitCode: number; signal?: number }) => void;
  } = {
    pid,
    cols: 80,
    rows: 24,
    process: 'shell',
    handleFlowControl: false,
    onData: dataEvent.event,
    onExit: exitEvent.event,
    resize: vi.fn(),
    clear: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    __fireData: dataEvent.fire,
    __fireExit: exitEvent.fire
  };
  return runtime;
}

describe('TerminalManager', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('emits starting then running status when a session starts', () => {
    const terminal = createMockPty();
    spawnMock.mockReturnValue(terminal);
    const events: TerminalEvent[] = [];
    const manager = new TerminalManager((event) => events.push(event), () => preferenceConfig);

    const metadata = manager.start('session-a', 'window-1');

    expect(metadata.status).toBe('running');
    expect(metadata.cols).toBe(80);
    expect(metadata.rows).toBe(24);
    const statusEvents = events.filter((event) => event.type === 'terminal-status');
    expect(statusEvents.map((event) => event.status)).toEqual(['starting', 'running']);
  });

  it('cleans up session after terminal exit', () => {
    const terminal = createMockPty();
    spawnMock.mockReturnValue(terminal);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    manager.start('session-a', 'window-1');
    terminal.__fireExit({ exitCode: 0 });

    expect(() => manager.write('session-a', 'window-1', 'pwd\n')).toThrow(
      'Terminal session is not running.'
    );
    expect(manager.close('session-a', 'window-1')).toBe(false);
  });

  it('throws when writing to a missing session', () => {
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    expect(() => manager.write('session-a', 'window-1', 'echo test\n')).toThrow(
      'Terminal session is not running.'
    );
  });

  it('supports subscribe streaming and transcript replay', () => {
    const terminal = createMockPty();
    spawnMock.mockReturnValue(terminal);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    manager.start('session-a', 'window-1');
    terminal.__fireData('hello');

    const received: string[] = [];
    const unsubscribe = manager.subscribe('session-a', 'window-1', (chunk) => received.push(chunk));
    expect(received.join('')).toContain('hello');

    terminal.__fireData(' world');
    expect(received.join('')).toContain('hello world');
    unsubscribe();
    terminal.__fireData('!');
    expect(received.join('')).not.toContain('!');
  });

  it('returns accurate close semantics for missing and closed sessions', () => {
    const first = createMockPty(1001);
    const second = createMockPty(1002);
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    expect(manager.close('session-a', 'window-1')).toBe(false);

    manager.start('session-a', 'window-1');
    first.__fireExit({ exitCode: 0 });
    expect(manager.close('session-a', 'window-1')).toBe(false);

    manager.start('session-a', 'window-1');
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(manager.close('session-a', 'window-1')).toBe(true);

    second.__fireExit({ exitCode: 0 });
    expect(manager.close('session-a', 'window-1')).toBe(false);
  });

  it('uses configured shell from preferences', () => {
    const terminal = createMockPty();
    spawnMock.mockReturnValue(terminal);
    const manager = new TerminalManager(() => {}, () => ({
      ...preferenceConfig,
      terminalShell: '/usr/bin/zsh'
    }));

    manager.start('session-a', 'window-1');

    expect(spawnMock).toHaveBeenCalledWith('/usr/bin/zsh', [], expect.any(Object));
  });
});
