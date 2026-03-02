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
  codexCommand: 'codex exec --skip-git-repo-check',
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

async function waitForRevision(
  orchestrator: WindowOrchestrator,
  sessionId: string,
  windowId: string,
  expectedRevision: number
) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    const snapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
    if (snapshot.status === 'ready' && snapshot.revision === expectedRevision) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for revision ${expectedRevision}`);
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

  it('passes open-window instruction into initial generation', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const deferred = createDeferred<{ source: string; backend: string }>();
    generateMock.mockReturnValueOnce(deferred.promise);

    orchestrator.openWindow({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      instruction: 'Build a note-taking tool with a markdown preview pane.'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0]?.[0]).toMatchObject({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      reason: 'initial',
      instruction: 'Build a note-taking tool with a markdown preview pane.'
    });

    deferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await deferred.promise;
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

  it('lists revision history and returns revision details', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise);

    orchestrator.openWindow({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      instruction: 'Initial instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    initialDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 1);

    orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    const revisions = orchestrator.listWindowRevisions(sessionId, windowId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.revision).toBe(2);
    expect(revisions[0]?.strategy).toBe('hmr');
    expect(revisions[1]?.revision).toBe(1);
    expect(revisions[1]?.strategy).toBe('remount');

    const revisionOne = orchestrator.getWindowRevision(sessionId, windowId, 1);
    expect(revisionOne.revision).toBe(1);
    expect(revisionOne.backend).toBe('mock');
    expect(revisionOne.prompt).toContain('Initial instruction');

    const revisionTwo = orchestrator.getWindowRevision(sessionId, windowId, 2);
    expect(revisionTwo.revision).toBe(2);
    expect(revisionTwo.prompt).toContain('Update instruction');

    const revisionTwoPrompt = orchestrator.getWindowRevisionPrompt(sessionId, windowId, 2);
    expect(revisionTwoPrompt.prompt).toContain('Previous module source:');
    expect(revisionTwoPrompt.prompt).toContain('[redacted]');
    expect(revisionTwoPrompt.prompt).not.toContain('Ready');
  });

  it('supports regenerating via edited prompt overrides', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();
    const promptDeferred = createDeferred<{ source: string; backend: string }>();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise)
      .mockReturnValueOnce(promptDeferred.promise);

    orchestrator.openWindow({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      instruction: 'Initial instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    initialDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 1);

    orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    const revisionTwoPrompt = orchestrator.getWindowRevisionPrompt(sessionId, windowId, 2);
    const editedPrompt = revisionTwoPrompt.prompt.replace('Update instruction', 'Edited instruction');

    orchestrator.requestPromptUpdate({
      sessionId,
      windowId,
      prompt: editedPrompt
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls[2]?.[0]).toMatchObject({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      reason: 'action',
      instruction: 'Edited instruction'
    });
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).toContain('Previous module source:');
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).toContain('Ready');
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).toContain('Edited instruction');
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).not.toContain('[redacted]');

    promptDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 3);

    const revisionThreePrompt = orchestrator.getWindowRevisionPrompt(sessionId, windowId, 3);
    expect(revisionThreePrompt.prompt).toContain('[redacted]');
    expect(revisionThreePrompt.prompt).not.toContain('Ready');
  });
});
