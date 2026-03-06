import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceConfig } from '../config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PersistedAppStore } from '../storage/persisted-apps';

const validGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Ready</div>;
}
`.trim();

const { generateMock, suggestArtifactMetadataMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  suggestArtifactMetadataMock: vi.fn()
}));

vi.mock('./llm/provider', () => ({
  createLlmProvider: () => ({
    generate: generateMock,
    suggestArtifactMetadata: suggestArtifactMetadataMock
  })
}));

import { WindowOrchestrator } from './service';

const preferenceConfig: PreferenceConfig = {
  serverPort: 5173,
  serverDisableHmr: false,
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check',
  codexTimeoutMs: 120_000,
  llmStreamOutput: false,
  terminalShell: '/bin/sh'
};

function createOrchestrator() {
  return new WindowOrchestrator(() => preferenceConfig);
}

async function createPersistedOrchestrator() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-app-store-test-'));
  const persistedAppStore = new PersistedAppStore({
    rootDir,
    managedPrefix: 'app-'
  });
  return {
    rootDir,
    persistedAppStore,
    orchestrator: new WindowOrchestrator(() => preferenceConfig, { persistedAppStore })
  };
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

async function waitForPersistedRevision(
  persistedAppStore: PersistedAppStore,
  appId: string,
  expectedRevision: number
) {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    const snapshot = await persistedAppStore.read(appId);
    if (snapshot?.revision === expectedRevision) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for persisted revision ${expectedRevision}`);
}

describe('WindowOrchestrator', () => {
  beforeEach(() => {
    generateMock.mockReset();
    suggestArtifactMetadataMock.mockReset();
    generateMock.mockResolvedValue({
      source: validGeneratedSource,
      backend: 'mock'
    });
    suggestArtifactMetadataMock.mockResolvedValue({
      emoji: '🧠',
      title: 'Focus Board',
      fileName: 'focus-board',
      backend: 'mock'
    });
  });

  it('opens system apps as ready without async generation', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = await orchestrator.openWindow({
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

  it('keeps system app updates as no-op', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    await orchestrator.openWindow({
      sessionId,
      windowId: 'window-system-preference',
      appId: 'preference',
      title: 'Preference'
    });

    const snapshot = await orchestrator.requestUpdate({
      sessionId,
      windowId: 'window-system-preference',
      instruction: 'Should be ignored'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);
  });

  it('still opens llm apps in loading state', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = await orchestrator.openWindow({
      sessionId,
      windowId: 'window-llm-notes',
      appId: 'notes',
      title: 'Notes'
    });

    expect(snapshot.status).toBe('loading');
    expect(snapshot.revision).toBe(0);
  });

  it('stores generation selection metadata for prompted llm windows', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();

    const snapshot = await orchestrator.openWindow({
      sessionId,
      windowId: 'window-selection',
      appId: 'notes',
      title: 'Notes',
      instruction: 'Build a focus board with timers.'
    });

    expect(snapshot.generationSelection).toEqual({
      emoji: '🧠',
      fileName: 'focus-board'
    });
    expect(suggestArtifactMetadataMock).toHaveBeenCalledTimes(1);
  });

  it('loads persisted app source when available', async () => {
    const { persistedAppStore, orchestrator } = await createPersistedOrchestrator();
    const appId = 'app-persisted';

    await persistedAppStore.write({
      appId,
      source: validGeneratedSource,
      revision: 3,
      title: 'Persisted'
    });

    const sessionId = orchestrator.createSession();
    const snapshot = await orchestrator.openWindow({
      sessionId,
      windowId: 'window-persisted',
      appId,
      title: 'Persisted'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(3);
    expect(generateMock).not.toHaveBeenCalled();

    const moduleSnapshot = orchestrator.getWindowModuleSource(sessionId, 'window-persisted');
    expect(moduleSnapshot.source).toContain('Ready');
  });

  it('persists generated revisions for managed app ids', async () => {
    const { persistedAppStore, orchestrator } = await createPersistedOrchestrator();
    const sessionId = orchestrator.createSession();
    const appId = 'app-new';
    const windowId = 'window-managed';

    await orchestrator.openWindow({
      sessionId,
      windowId,
      appId,
      title: 'Managed app'
    });

    await waitForRevision(orchestrator, sessionId, windowId, 1);

    const persisted = await waitForPersistedRevision(persistedAppStore, appId, 1);
    expect(persisted.revision).toBe(1);
    expect(persisted.source).toContain('Ready');
  });

  it('passes open-window instruction into initial generation', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const deferred = createDeferred<{ source: string; backend: string }>();
    generateMock.mockReturnValueOnce(deferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.openWindow({
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

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
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

  it('moves the active head across saved revisions without discarding history', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();

    const updatedGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Updated</div>;
}
`.trim();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: updatedGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    const rolledBackSnapshot = await orchestrator.rollbackWindow(sessionId, windowId, 1);
    expect(rolledBackSnapshot.revision).toBe(1);
    expect(orchestrator.listWindowRevisions(sessionId, windowId)).toHaveLength(2);
    expect(orchestrator.getWindowModuleSource(sessionId, windowId)).toEqual({
      revision: 1,
      source: validGeneratedSource
    });

    const restoredSnapshot = await orchestrator.rollbackWindow(sessionId, windowId, 2);
    expect(restoredSnapshot.revision).toBe(2);
    expect(orchestrator.listWindowRevisions(sessionId, windowId)).toHaveLength(2);
    expect(orchestrator.getWindowModuleSource(sessionId, windowId)).toEqual({
      revision: 2,
      source: updatedGeneratedSource
    });
  });

  it('generates from the current head after switching revisions', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();
    const regenerateDeferred = createDeferred<{ source: string; backend: string }>();

    const updatedGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Updated</div>;
}
`.trim();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise)
      .mockReturnValueOnce(regenerateDeferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: updatedGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    await orchestrator.rollbackWindow(sessionId, windowId, 1);

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Generate from rolled-back head'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls[2]?.[0]?.previousSource).toBe(validGeneratedSource);
    expect(generateMock.mock.calls[2]?.[0]?.previousSource).not.toBe(updatedGeneratedSource);

    regenerateDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 3);
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

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
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

    await orchestrator.requestPromptUpdate({
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

  it('ignores in-flight update generations that finish after a rollback', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(orchestrator.getWindowSnapshot(sessionId, windowId).status).toBe('loading');

    await orchestrator.rollbackWindow(sessionId, windowId, 1);
    const rolledBackSnapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
    expect(rolledBackSnapshot.status).toBe('ready');
    expect(rolledBackSnapshot.revision).toBe(1);

    updateDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await updateDeferred.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    const finalSnapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
    expect(finalSnapshot.status).toBe('ready');
    expect(finalSnapshot.revision).toBe(1);
    expect(orchestrator.listWindowRevisions(sessionId, windowId)).toHaveLength(1);
  });

  it('branches a new window from a past revision without discarding history', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const branchedWindowId = 'window-llm-notes-branch';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();

    const updatedGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Updated</div>;
}
`.trim();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: updatedGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    const snapshot = orchestrator.branchWindowRevision({
      sessionId,
      sourceWindowId: windowId,
      sourceRevision: 1,
      newWindowId: branchedWindowId
    });

    expect(snapshot.windowId).toBe(branchedWindowId);
    expect(snapshot.appId).toBe('notes');
    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.title).toContain('branch r1');

    const sourceHistory = orchestrator.listWindowRevisions(sessionId, windowId);
    expect(sourceHistory).toHaveLength(2);
    expect(sourceHistory[0]?.revision).toBe(2);

    const branchedSource = orchestrator.getWindowModuleSource(sessionId, branchedWindowId);
    expect(branchedSource.revision).toBe(1);
    expect(branchedSource.source).toContain('Ready');
    expect(branchedSource.source).not.toContain('Updated');
  });

  it('regenerates a new revision from a past revision prompt', async () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const windowId = 'window-llm-notes';
    const initialDeferred = createDeferred<{ source: string; backend: string }>();
    const updateDeferred = createDeferred<{ source: string; backend: string }>();
    const regenerateDeferred = createDeferred<{ source: string; backend: string }>();

    const updatedGeneratedSource = `
import React from 'react';

export default function WindowApp() {
  return <div>Updated</div>;
}
`.trim();

    generateMock
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(updateDeferred.promise)
      .mockReturnValueOnce(regenerateDeferred.promise);

    await orchestrator.openWindow({
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

    await orchestrator.requestUpdate({
      sessionId,
      windowId,
      instruction: 'Update instruction'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    updateDeferred.resolve({
      source: updatedGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 2);

    await orchestrator.regenerateWindowRevision(sessionId, windowId, 1);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls[2]?.[0]).toMatchObject({
      sessionId,
      windowId,
      appId: 'notes',
      title: 'Notes',
      reason: 'action',
      instruction: 'Initial instruction'
    });
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).toContain('Previous module source:');
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).toContain('Updated');
    expect(generateMock.mock.calls[2]?.[0]?.promptOverride).not.toContain('[redacted]');

    regenerateDeferred.resolve({
      source: validGeneratedSource,
      backend: 'mock'
    });
    await waitForRevision(orchestrator, sessionId, windowId, 3);
  });
});
