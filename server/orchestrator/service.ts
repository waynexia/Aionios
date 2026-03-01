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

export class WindowOrchestrator {
  private readonly store = new SessionStore();
  private readonly eventBus = new SessionEventBus();
  private moduleBridge?: ModuleUpdateBridge;
  private readonly windowTaskQueue = new Map<string, Promise<void>>();

  constructor(private readonly readConfig: () => PreferenceConfig) {}

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

    void this.enqueueWindowTask(input.sessionId, input.windowId, async () => {
      await this.generateRevision({
        sessionId: input.sessionId,
        windowId: input.windowId,
        reason: 'initial'
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

    void this.enqueueWindowTask(input.sessionId, input.windowId, async () => {
      await this.generateRevision({
        sessionId: input.sessionId,
        windowId: input.windowId,
        reason: 'action',
        instruction: input.instruction
      });
    });

    return this.getWindowSnapshot(input.sessionId, input.windowId);
  }

  closeWindow(sessionId: string, windowId: string) {
    const deleted = this.store.deleteWindow(sessionId, windowId);
    return deleted;
  }

  async rollbackWindow(sessionId: string, windowId: string, targetRevision: number) {
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
    instruction
  }: {
    sessionId: string;
    windowId: string;
    reason: 'initial' | 'action';
    instruction?: string;
  }) {
    const record = this.store.getWindow(sessionId, windowId);
    if (!record) {
      return;
    }

    const previousSource = record.revisions.at(-1)?.source;
    const request = {
      sessionId,
      windowId,
      appId: record.appId,
      title: record.title,
      reason,
      instruction,
      context: record.context,
      previousSource
    } as const;

    const prompt = buildGenerationPrompt(request);
    try {
      const generated = await createLlmProvider(this.readConfig()).generate(request);
      const validation = await validateGeneratedSource(generated.source);
      if (!validation.valid) {
        throw new Error(validation.issues.join('; '));
      }

      const plannedStrategy = pickUpdateStrategy(previousSource, generated.source);
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
