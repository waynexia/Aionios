import { nanoid } from 'nanoid';
import type { PreferenceConfig } from '../config';
import { buildGenerationPrompt, createContextEntry } from './context';
import { SessionEventBus } from './event-bus';
import { createLlmProvider } from './llm/provider';
import { SessionStore } from './store';
import { getSystemModuleSource, isSystemApp } from './system-modules';
import type {
  SessionEvent,
  ModuleUpdateBridge,
  OpenWindowInput,
  UpdateStrategy,
  WindowActionInput,
  WindowRevision,
  WindowSnapshot
} from './types';
import { validateGeneratedSource } from './validator';

function buildWindowKey(sessionId: string, windowId: string) {
  return `${sessionId}:${windowId}`;
}

function pickUpdateStrategy(previousSource: string | undefined, nextSource: string): UpdateStrategy {
  if (!previousSource) {
    return 'remount';
  }

  const importPattern = /import[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  const currentImports = Array.from(previousSource.matchAll(importPattern))
    .map((entry) => entry[1])
    .sort();
  const nextImports = Array.from(nextSource.matchAll(importPattern))
    .map((entry) => entry[1])
    .sort();
  if (currentImports.join(',') !== nextImports.join(',')) {
    return 'remount';
  }

  const hasDefaultWindowExport =
    /export\s+default\s+function\s+WindowApp\b/.test(previousSource) &&
    /export\s+default\s+function\s+WindowApp\b/.test(nextSource);
  return hasDefaultWindowExport ? 'hmr' : 'remount';
}

function redactPreviousSource(prompt: string) {
  const startMarker = 'Previous module source:';
  const endMarker = 'Return only TSX module code.';
  const startIndex = prompt.indexOf(startMarker);
  if (startIndex === -1) {
    return prompt;
  }
  const endIndex = prompt.indexOf(endMarker, startIndex);
  const redacted = `${startMarker}\n[redacted]\n\n`;
  if (endIndex === -1) {
    return `${prompt.slice(0, startIndex)}${redacted}`.trimEnd();
  }
  return `${prompt.slice(0, startIndex)}${redacted}${prompt.slice(endIndex)}`.trimEnd();
}

function extractUserInstructionFromPrompt(prompt: string) {
  const startMarker = 'User instruction for this update:';
  const endMarker = '\nRecent context:';
  const startIndex = prompt.indexOf(startMarker);
  if (startIndex === -1) {
    return undefined;
  }
  let contentStart = startIndex + startMarker.length;
  if (prompt[contentStart] === '\r' && prompt[contentStart + 1] === '\n') {
    contentStart += 2;
  } else if (prompt[contentStart] === '\n') {
    contentStart += 1;
  }
  const endIndex = prompt.indexOf(endMarker, contentStart);
  const content = endIndex === -1 ? prompt.slice(contentStart) : prompt.slice(contentStart, endIndex);
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hydrateRedactedPreviousSource(prompt: string, previousSource: string | undefined) {
  if (!previousSource) {
    return prompt;
  }
  const startMarker = 'Previous module source:';
  const endMarker = 'Return only TSX module code.';
  const startIndex = prompt.indexOf(startMarker);
  if (startIndex === -1) {
    const firstRenderMarker = 'No previous source exists yet (first render).';
    const firstRenderIndex = prompt.indexOf(firstRenderMarker);
    if (firstRenderIndex === -1) {
      return prompt;
    }
    const hydrated = `${startMarker}\n${previousSource}\n\n`;
    return `${prompt.slice(0, firstRenderIndex)}${hydrated}${prompt.slice(
      firstRenderIndex + firstRenderMarker.length
    )}`.trimEnd();
  }
  const endIndex = prompt.indexOf(endMarker, startIndex);
  if (endIndex === -1) {
    return prompt;
  }
  const section = prompt.slice(startIndex, endIndex);
  if (!section.includes('[redacted]')) {
    return prompt;
  }
  const hydrated = `${startMarker}\n${previousSource}\n\n`;
  return `${prompt.slice(0, startIndex)}${hydrated}${prompt.slice(endIndex)}`.trimEnd();
}

export class WindowOrchestrator {
  private readonly store = new SessionStore();
  private readonly eventBus = new SessionEventBus();
  private moduleBridge?: ModuleUpdateBridge;
  private readonly windowTaskQueue = new Map<string, Promise<void>>();
  private readonly windowRollbackBarrier = new Map<string, number>();

  constructor(private readonly readConfig: () => PreferenceConfig) {}

  private getRollbackBarrier(sessionId: string, windowId: string) {
    const key = buildWindowKey(sessionId, windowId);
    return this.windowRollbackBarrier.get(key) ?? 0;
  }

  private bumpRollbackBarrier(sessionId: string, windowId: string) {
    const key = buildWindowKey(sessionId, windowId);
    const next = (this.windowRollbackBarrier.get(key) ?? 0) + 1;
    this.windowRollbackBarrier.set(key, next);
    return next;
  }

  createSession() {
    const sessionId = nanoid(16);
    this.store.createSession(sessionId);
    return sessionId;
  }

  ensureSession(sessionId: string) {
    this.store.createSession(sessionId);
  }

  subscribe(sessionId: string, response: Parameters<SessionEventBus['subscribe']>[1]) {
    this.eventBus.subscribe(sessionId, response);
  }

  attachModuleBridge(moduleBridge: ModuleUpdateBridge) {
    this.moduleBridge = moduleBridge;
  }

  publishSessionEvent(event: SessionEvent) {
    this.eventBus.publish(event);
  }

  listWindows(sessionId: string): WindowSnapshot[] {
    return this.store.listWindows(sessionId);
  }

  getWindowSnapshot(sessionId: string, windowId: string): WindowSnapshot {
    const record = this.store.getWindow(sessionId, windowId);
    if (!record) {
      throw new Error(`Window ${sessionId}/${windowId} not found`);
    }
    return {
      sessionId,
      windowId,
      appId: record.appId,
      title: record.title,
      status: record.status,
      revision: record.revisions.at(-1)?.revision ?? 0,
      error: record.error
      };
  }

  listWindowRevisions(sessionId: string, windowId: string) {
    const record = this.store.getWindow(sessionId, windowId);
    if (!record) {
      throw new Error(`Window ${sessionId}/${windowId} not found`);
    }
    return [...record.revisions]
      .sort((left, right) => right.revision - left.revision)
      .map((revision) => ({
        revision: revision.revision,
        generatedAt: revision.generatedAt,
        backend: revision.backend,
        strategy: revision.strategy
      }));
  }

  getWindowRevision(sessionId: string, windowId: string, targetRevision: number): WindowRevision {
    const record = this.store.getWindow(sessionId, windowId);
    if (!record) {
      throw new Error(`Window ${sessionId}/${windowId} not found`);
    }
    const revision = record.revisions.find((entry) => entry.revision === targetRevision);
    if (!revision) {
      throw new Error(`Revision ${targetRevision} not found`);
    }
    return revision;
  }

  getWindowRevisionPrompt(sessionId: string, windowId: string, targetRevision: number) {
    const revision = this.getWindowRevision(sessionId, windowId, targetRevision);
    return {
      revision: revision.revision,
      generatedAt: revision.generatedAt,
      backend: revision.backend,
      strategy: revision.strategy,
      prompt: redactPreviousSource(revision.prompt)
    };
  }

  openWindow(input: OpenWindowInput): WindowSnapshot {
    const windowRecord = this.store.createWindow(input);
    this.store.addContextEntry(
      input.sessionId,
      input.windowId,
      createContextEntry(
        'system',
        `Window opened for app "${windowRecord.appId}" titled "${windowRecord.title}".`
      )
    );
    if (input.instruction) {
      this.store.addContextEntry(
        input.sessionId,
        input.windowId,
        createContextEntry('user', input.instruction)
      );
    }

    const systemSource = getSystemModuleSource(windowRecord.appId);
    if (systemSource) {
      const revision = this.store.addRevision(
        input.sessionId,
        input.windowId,
        systemSource,
        '[system module preload]',
        'system',
        'remount'
      );
      this.store.addContextEntry(
        input.sessionId,
        input.windowId,
        createContextEntry('assistant', `Loaded system app revision ${revision.revision}.`)
      );
      this.eventBus.publish({
        type: 'window-ready',
        sessionId: input.sessionId,
        windowId: input.windowId,
        appId: input.appId,
        title: input.title,
        status: 'ready',
        revision: revision.revision,
        strategy: 'remount'
      });

      return {
        sessionId: input.sessionId,
        windowId: input.windowId,
        appId: windowRecord.appId,
        title: windowRecord.title,
        status: windowRecord.status,
        revision: revision.revision
      };
    }

    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: input.appId,
      title: input.title,
      status: 'loading'
    });

    const rollbackBarrier = this.getRollbackBarrier(input.sessionId, input.windowId);
    void this.enqueueWindowTask(input.sessionId, input.windowId, async () => {
      await this.generateRevision({
        sessionId: input.sessionId,
        windowId: input.windowId,
        reason: 'initial',
        instruction: input.instruction,
        rollbackBarrier
      });
    });

    return {
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: windowRecord.appId,
      title: windowRecord.title,
      status: windowRecord.status,
      revision: windowRecord.revisions.at(-1)?.revision ?? 0
    };
  }

  requestUpdate(input: WindowActionInput): WindowSnapshot {
    const windowRecord = this.store.getWindow(input.sessionId, input.windowId);
    if (!windowRecord) {
      throw new Error(`Window ${input.sessionId}/${input.windowId} not found`);
    }
    if (isSystemApp(windowRecord.appId)) {
      return this.getWindowSnapshot(input.sessionId, input.windowId);
    }
    this.store.addContextEntry(
      input.sessionId,
      input.windowId,
      createContextEntry('user', input.instruction)
    );
    this.store.setLoading(input.sessionId, input.windowId);
    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      status: 'loading'
    });

    const rollbackBarrier = this.getRollbackBarrier(input.sessionId, input.windowId);
    void this.enqueueWindowTask(input.sessionId, input.windowId, async () => {
      await this.generateRevision({
        sessionId: input.sessionId,
        windowId: input.windowId,
        reason: 'action',
        instruction: input.instruction,
        rollbackBarrier
      });
    });

    return this.getWindowSnapshot(input.sessionId, input.windowId);
  }

  requestPromptUpdate(input: { sessionId: string; windowId: string; prompt: string }): WindowSnapshot {
    const windowRecord = this.store.getWindow(input.sessionId, input.windowId);
    if (!windowRecord) {
      throw new Error(`Window ${input.sessionId}/${input.windowId} not found`);
    }
    if (isSystemApp(windowRecord.appId)) {
      return this.getWindowSnapshot(input.sessionId, input.windowId);
    }

    const normalizedPrompt = input.prompt.trimEnd();
    const instruction = extractUserInstructionFromPrompt(normalizedPrompt);
    if (instruction) {
      this.store.addContextEntry(
        input.sessionId,
        input.windowId,
        createContextEntry('user', instruction)
      );
    } else {
      this.store.addContextEntry(
        input.sessionId,
        input.windowId,
        createContextEntry('user', '[Edited generation prompt]')
      );
    }

    this.store.setLoading(input.sessionId, input.windowId);
    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      status: 'loading'
    });

    const rollbackBarrier = this.getRollbackBarrier(input.sessionId, input.windowId);
    void this.enqueueWindowTask(input.sessionId, input.windowId, async () => {
      await this.generateRevision({
        sessionId: input.sessionId,
        windowId: input.windowId,
        reason: 'action',
        instruction,
        promptOverride: normalizedPrompt,
        rollbackBarrier
      });
    });

    return this.getWindowSnapshot(input.sessionId, input.windowId);
  }

  regenerateWindowRevision(sessionId: string, windowId: string, targetRevision: number): WindowSnapshot {
    const revision = this.getWindowRevision(sessionId, windowId, targetRevision);
    const prompt = redactPreviousSource(revision.prompt);
    return this.requestPromptUpdate({ sessionId, windowId, prompt });
  }

  branchWindowRevision(input: {
    sessionId: string;
    sourceWindowId: string;
    sourceRevision: number;
    newWindowId: string;
    title?: string;
  }): WindowSnapshot {
    const sourceRecord = this.store.getWindow(input.sessionId, input.sourceWindowId);
    if (!sourceRecord) {
      throw new Error(`Window ${input.sessionId}/${input.sourceWindowId} not found`);
    }
    if (isSystemApp(sourceRecord.appId)) {
      throw new Error('Cannot branch system app windows.');
    }
    if (this.store.getWindow(input.sessionId, input.newWindowId)) {
      throw new Error(`Window ${input.sessionId}/${input.newWindowId} already exists`);
    }

    const sourceRevision = this.getWindowRevision(
      input.sessionId,
      input.sourceWindowId,
      input.sourceRevision
    );
    const title = input.title ?? `${sourceRecord.title} (branch r${input.sourceRevision})`;

    this.store.createWindow({
      sessionId: input.sessionId,
      windowId: input.newWindowId,
      appId: sourceRecord.appId,
      title
    });

    this.store.addContextEntry(
      input.sessionId,
      input.newWindowId,
      createContextEntry(
        'system',
        `Branched from window "${input.sourceWindowId}" revision ${input.sourceRevision}.`
      )
    );

    this.store.addRevision(
      input.sessionId,
      input.newWindowId,
      sourceRevision.source,
      sourceRevision.prompt,
      sourceRevision.backend,
      'remount'
    );

    return this.getWindowSnapshot(input.sessionId, input.newWindowId);
  }

  closeWindow(sessionId: string, windowId: string) {
    this.windowRollbackBarrier.delete(buildWindowKey(sessionId, windowId));
    const deleted = this.store.deleteWindow(sessionId, windowId);
    return deleted;
  }

  async rollbackWindow(sessionId: string, windowId: string, targetRevision: number) {
    this.bumpRollbackBarrier(sessionId, windowId);
    const revision = this.store.rollbackToRevision(sessionId, windowId, targetRevision);
    if (this.moduleBridge) {
      await this.moduleBridge.pushWindowUpdate(sessionId, windowId, 'remount');
    }
    this.eventBus.publish({
      type: 'window-remount',
      sessionId,
      windowId,
      revision: revision.revision,
      strategy: 'remount'
    });
    this.eventBus.publish({
      type: 'window-updated',
      sessionId,
      windowId,
      revision: revision.revision,
      strategy: 'remount',
      status: 'ready'
    });
    return this.getWindowSnapshot(sessionId, windowId);
  }

  getWindowModuleSource(sessionId: string, windowId: string) {
    const snapshot = this.store.getWindowSource(sessionId, windowId);
    const record = this.store.getWindow(sessionId, windowId);
    if (snapshot) {
      return snapshot;
    }

    if (!record) {
      return {
        revision: 0,
        source: `
import React from 'react';
export default function WindowApp() {
  return <div style={{ padding: 16, color: '#f8fafc' }}>Window not found.</div>;
}
`.trim()
      };
    }

    if (record.status === 'error') {
      const message = record.error ?? 'Unknown error';
      return {
        revision: 0,
        source: `
import React from 'react';
export default function WindowApp() {
  return <div style={{ padding: 16, color: '#fecaca' }}>Generation failed: ${JSON.stringify(message)}</div>;
}
`.trim()
      };
    }

    return {
      revision: 0,
      source: `
import React from 'react';
export default function WindowApp() {
  return <div style={{ padding: 16, color: '#cbd5e1' }}>Generating window module…</div>;
}
`.trim()
    };
  }

  private async enqueueWindowTask(
    sessionId: string,
    windowId: string,
    task: () => Promise<void>
  ): Promise<void> {
    const key = buildWindowKey(sessionId, windowId);
    const current = this.windowTaskQueue.get(key) ?? Promise.resolve();
    const next = current
      .catch(() => undefined)
      .then(async () => {
        await task();
      })
      .finally(() => {
        if (this.windowTaskQueue.get(key) === next) {
          this.windowTaskQueue.delete(key);
        }
      });
    this.windowTaskQueue.set(key, next);
    await next;
  }

  private async generateRevision({
    sessionId,
    windowId,
    reason,
    instruction,
    promptOverride,
    rollbackBarrier
  }: {
    sessionId: string;
    windowId: string;
    reason: 'initial' | 'action';
    instruction?: string;
    promptOverride?: string;
    rollbackBarrier: number;
  }) {
    if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
      return;
    }
    const record = this.store.getWindow(sessionId, windowId);
    if (!record) {
      return;
    }

    const previousSource = record.revisions.at(-1)?.source;
    const hydratedPromptOverride =
      typeof promptOverride === 'string' && promptOverride.trim().length > 0
        ? hydrateRedactedPreviousSource(promptOverride, previousSource)
        : undefined;
    const request = {
      sessionId,
      windowId,
      appId: record.appId,
      title: record.title,
      reason,
      instruction,
      promptOverride: hydratedPromptOverride,
      context: record.context,
      previousSource
    } as const;

    const prompt = buildGenerationPrompt(request);
    try {
      const generated = await createLlmProvider(this.readConfig()).generate(request);
      if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
        return;
      }
      const validation = await validateGeneratedSource(generated.source);
      if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
        return;
      }
      if (!validation.valid) {
        throw new Error(validation.issues.join('; '));
      }

      const plannedStrategy = pickUpdateStrategy(previousSource, generated.source);
      if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
        return;
      }
      const revision = this.store.addRevision(
        sessionId,
        windowId,
        generated.source,
        prompt,
        generated.backend,
        plannedStrategy
      );
      this.store.addContextEntry(
        sessionId,
        windowId,
        createContextEntry('assistant', `Generated revision ${revision.revision} with ${generated.backend}.`)
      );

      const strategyResult = this.moduleBridge
        ? await this.moduleBridge.pushWindowUpdate(sessionId, windowId, plannedStrategy)
        : { strategy: plannedStrategy };
      if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
        return;
      }

      if (strategyResult.strategy === 'remount') {
        this.eventBus.publish({
          type: 'window-remount',
          sessionId,
          windowId,
          revision: revision.revision,
          strategy: 'remount'
        });
      }

      this.eventBus.publish({
        type: reason === 'initial' ? 'window-ready' : 'window-updated',
        sessionId,
        windowId,
        appId: record.appId,
        title: record.title,
        revision: revision.revision,
        strategy: strategyResult.strategy,
        status: 'ready'
      });
    } catch (error) {
      if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
        return;
      }
      const message = (error as Error).message;
      if (!this.store.getWindow(sessionId, windowId)) {
        return;
      }
      this.store.setError(sessionId, windowId, message);
      this.store.addContextEntry(
        sessionId,
        windowId,
        createContextEntry('assistant', `Generation failed: ${message}`)
      );
      this.eventBus.publish({
        type: 'window-error',
        sessionId,
        windowId,
        appId: record.appId,
        status: 'error',
        error: message
      });
    }
  }
}
