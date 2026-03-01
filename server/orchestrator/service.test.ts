import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceConfig } from '../config';

const validGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Ready</div>;
}
`.trim();

const { generateMock } = vi.hoisted(() => ({
  generateMock: vi.fn()
}));

vi.mock('./llm/provider', () => ({
  createLlmProvider: () => ({
    generate: generateMock
  })
}));

import { WindowOrchestrator } from './service';

const preferenceConfig: PreferenceConfig = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check --output-last-message',
  codexTimeoutMs: 120_000,
  terminalShell: '/bin/sh'
};

function createOrchestrator() {
  return new WindowOrchestrator(() => preferenceConfig);
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('WindowOrchestrator', () => {
  beforeEach(() => {
    generateMock.mockReset();
    generateMock.mockResolvedValue({
      source: validGeneratedSource,
      backend: 'mock'
    });
  });

  it('opens system apps as ready without async generation', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = orchestrator.openWindow({
      sessionId,
      windowId: 'window-system-terminal',
      appId: 'terminal',
      title: 'Terminal'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);

    const moduleSnapshot = orchestrator.getWindowModuleSource(sessionId, 'window-system-terminal');
    expect(moduleSnapshot.revision).toBe(1);
    expect(moduleSnapshot.source).toContain('@xterm/xterm');
  });

  it('keeps system app updates as no-op', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    orchestrator.openWindow({
      sessionId,
      windowId: 'window-system-preference',
      appId: 'preference',
      title: 'Preference'
    });

    const snapshot = orchestrator.requestUpdate({
      sessionId,
      windowId: 'window-system-preference',
      instruction: 'Should be ignored'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);
  });

  it('still opens llm apps in loading state', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = orchestrator.openWindow({
      sessionId,
      windowId: 'window-llm-notes',
      appId: 'notes',
      title: 'Notes'
    });

    expect(snapshot.status).toBe('loading');
    expect(snapshot.revision).toBe(0);
  });

  it('does not throw when generation finishes after the window is closed', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const deferred = createDeferred<{ source: string; backend: string }>();
    generateMock.mockReturnValueOnce(deferred.promise);

    orchestrator.openWindow({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes'
    });
    expect(orchestrator.closeWindow(sessionId, windowId)).toBe(true);

    deferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await deferred.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(orchestrator.listWindows(sessionId)).toEqual([]);
  });
});
