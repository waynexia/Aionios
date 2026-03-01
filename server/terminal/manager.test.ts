import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceConfig } from '../config';
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalStatusEvent
} from '../orchestrator/types';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

import { TerminalManager } from './manager';

type TerminalEvent = TerminalStatusEvent | TerminalOutputEvent | TerminalExitEvent;
const preferenceConfig: PreferenceConfig = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check --output-last-message',
  codexTimeoutMs: 120_000,
  terminalShell: '/bin/bash'
};

function createMockChildProcess(pid = 1001) {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;

  Object.defineProperties(child, {
    stdin: {
      value: new PassThrough() as ChildProcessWithoutNullStreams['stdin'],
      writable: true
    },
    stdout: {
      value: new PassThrough() as ChildProcessWithoutNullStreams['stdout'],
      writable: true
    },
    stderr: {
      value: new PassThrough() as ChildProcessWithoutNullStreams['stderr'],
      writable: true
    },
    pid: {
      value: pid,
      writable: true
    },
    killed: {
      value: false,
      writable: true
    },
    exitCode: {
      value: null,
      writable: true
    },
    signalCode: {
      value: null,
      writable: true
    }
  });

  child.kill = vi.fn((signal?: NodeJS.Signals | number) => {
    if (signal === 'SIGTERM') {
      Reflect.set(child as object, 'killed', true);
      return true;
    }
    return false;
  }) as ChildProcessWithoutNullStreams['kill'];

  return child;
}

describe('TerminalManager', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('emits starting then running status when a session starts', () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const events: TerminalEvent[] = [];
    const manager = new TerminalManager((event) => events.push(event), () => preferenceConfig);

    const metadata = manager.start('session-a', 'window-1');

    expect(metadata.status).toBe('running');
    const statusEvents = events.filter((event) => event.type === 'terminal-status');
    expect(statusEvents.map((event) => event.status)).toEqual(['starting', 'running']);
  });

  it('cleans up session after child close', () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    manager.start('session-a', 'window-1');
    child.emit('close', 0, null);

    expect(() => manager.write('session-a', 'window-1', 'pwd\n')).toThrow(
      'Terminal session is not running.'
    );
    expect(manager.close('session-a', 'window-1')).toBe(false);
  });

  it('cleans up session when child emits error', () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    manager.start('session-a', 'window-1');
    child.emit('error', new Error('spawn failed'));

    expect(() => manager.write('session-a', 'window-1', 'echo test\n')).toThrow(
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

  it('returns accurate close semantics for missing and closed sessions', () => {
    const firstChild = createMockChildProcess(1001);
    const secondChild = createMockChildProcess(1002);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const manager = new TerminalManager(() => {}, () => preferenceConfig);

    expect(manager.close('session-a', 'window-1')).toBe(false);

    manager.start('session-a', 'window-1');
    Reflect.set(firstChild as object, 'exitCode', 0);
    expect(manager.close('session-a', 'window-1')).toBe(false);

    manager.start('session-a', 'window-1');
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(manager.close('session-a', 'window-1')).toBe(true);

    secondChild.emit('close', 0, null);
    expect(manager.close('session-a', 'window-1')).toBe(false);
  });

  it('uses configured shell from preferences', () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const manager = new TerminalManager(() => {}, () => ({
      ...preferenceConfig,
      terminalShell: '/usr/bin/zsh'
    }));

    manager.start('session-a', 'window-1');

    expect(spawnMock).toHaveBeenCalledWith('/usr/bin/zsh', [], expect.any(Object));
  });
});
