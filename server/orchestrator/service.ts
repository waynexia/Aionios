import { nanoid } from 'nanoid';
import type { PreferenceConfig } from '../config';
import type { PersistedAppStore } from '../storage/persisted-apps';
import { buildGenerationPrompt, createContextEntry } from './context';
import { SessionEventBus } from './event-bus';
import { buildFallbackArtifactMetadata } from './llm/metadata';
import { createLlmProvider } from './llm/provider';
import {
  extractUserInstructionFromPrompt,
  hydrateRedactedPreviousSource,
  redactPreviousSource
} from './prompt-utils';
import { SessionStore } from './store';
import { getSystemModuleSource, isSystemApp } from './system-modules';
import type {
  SessionEvent,
  ModuleUpdateBridge,
  OpenWindowInput,
  SuggestArtifactMetadataRequest,
  SuggestArtifactMetadataResult,
  WindowActionInput,
  WindowGenerationSelection,
  WindowRevision,
  WindowSnapshot
} from './types';
import { pickUpdateStrategy } from './update-strategy';
import { validateGeneratedSource } from './validator';
import { buildWindowFallbackSource } from './window-fallback-source';

function buildWindowKey(sessionId: string, windowId: string) {
  return `${sessionId}:${windowId}`;
}

export class WindowOrchestrator {
  private readonly store = new SessionStore();
  private readonly eventBus = new SessionEventBus();
  private moduleBridge?: ModuleUpdateBridge;
  private readonly windowTaskQueue = new Map<string, Promise<void>>();
  private readonly windowRollbackBarrier = new Map<string, number>();
  private readonly persistedAppStore?: PersistedAppStore;

  constructor(
    private readonly readConfig: () => PreferenceConfig,
    options?: { persistedAppStore?: PersistedAppStore }
  ) {
    this.persistedAppStore = options?.persistedAppStore;
  }

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

    const snapshots = this.listWindows(sessionId);
    for (const snapshot of snapshots) {
      const record = this.store.getWindow(sessionId, snapshot.windowId);
      const strategy = record?.revisions.at(-1)?.strategy;
      const event: SessionEvent = {
        type:
          snapshot.status === 'ready'
            ? 'window-ready'
            : snapshot.status === 'error'
              ? 'window-error'
              : 'window-status',
        sessionId,
        windowId: snapshot.windowId,
        appId: snapshot.appId,
        title: snapshot.title,
        generationSelection: snapshot.generationSelection,
        status: snapshot.status,
        revision: snapshot.revision,
        strategy,
        error: snapshot.error
      };

      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
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
      generationSelection: record.generationSelection,
      status: record.status,
      revision: record.revisions.at(-1)?.revision ?? 0,
      error: record.error
    };
  }

  async suggestArtifactMetadata(
    input: SuggestArtifactMetadataRequest
  ): Promise<SuggestArtifactMetadataResult> {
    const fallback = buildFallbackArtifactMetadata(input);
    try {
      return await createLlmProvider(this.readConfig()).suggestArtifactMetadata(input);
    } catch (error) {
      console.warn('[aionios] unable to suggest artifact metadata', error);
      return fallback;
    }
  }

  private async resolveWindowGenerationSelection(input: {
    sessionId: string;
    windowId: string;
    appId: string;
    title: string;
    instruction?: string;
  }): Promise<WindowGenerationSelection | undefined> {
    const instruction = input.instruction?.trim();
    if (!instruction) {
      return undefined;
    }

    const metadata = await this.suggestArtifactMetadata({
      kind: 'window',
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: input.appId,
      title: input.title,
      instruction
    });

    return {
      emoji: metadata.emoji,
      fileName: metadata.fileName
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

  async openWindow(input: OpenWindowInput): Promise<WindowSnapshot> {
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
    if (input.generationSelection) {
      this.store.setGenerationSelection(input.sessionId, input.windowId, input.generationSelection);
    } else if (!isSystemApp(windowRecord.appId) && input.instruction) {
      const generationSelection = await this.resolveWindowGenerationSelection({
        sessionId: input.sessionId,
        windowId: input.windowId,
        appId: input.appId,
        title: input.title,
        instruction: input.instruction
      });
      this.store.setGenerationSelection(input.sessionId, input.windowId, generationSelection);
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
        generationSelection: windowRecord.generationSelection,
        status: 'ready',
        revision: revision.revision,
        strategy: 'remount'
      });

      return {
        sessionId: input.sessionId,
        windowId: input.windowId,
        appId: windowRecord.appId,
        title: windowRecord.title,
        generationSelection: windowRecord.generationSelection,
        status: windowRecord.status,
        revision: revision.revision
      };
    }

    const persistedSnapshot = this.persistedAppStore
      ? await this.persistedAppStore.read(windowRecord.appId)
      : null;
    if (persistedSnapshot) {
      this.store.loadRevision(input.sessionId, input.windowId, {
        revision: persistedSnapshot.revision,
        source: persistedSnapshot.source,
        prompt: '[persisted module preload]',
        strategy: 'remount',
        backend: 'persisted',
        generatedAt: persistedSnapshot.updatedAt
      });

      this.store.addContextEntry(
        input.sessionId,
        input.windowId,
        createContextEntry(
          'assistant',
          `Loaded persisted app revision ${persistedSnapshot.revision}.`
        )
      );

      if (!input.instruction) {
        this.eventBus.publish({
          type: 'window-ready',
          sessionId: input.sessionId,
          windowId: input.windowId,
          appId: input.appId,
          title: input.title,
          generationSelection: windowRecord.generationSelection,
          status: 'ready',
          revision: persistedSnapshot.revision,
          strategy: 'remount'
        });
        return this.getWindowSnapshot(input.sessionId, input.windowId);
      }

      this.store.setLoading(input.sessionId, input.windowId);
      this.eventBus.publish({
        type: 'window-status',
        sessionId: input.sessionId,
        windowId: input.windowId,
        appId: input.appId,
        title: input.title,
        generationSelection: windowRecord.generationSelection,
        status: 'loading',
        revision: persistedSnapshot.revision,
        strategy: 'remount'
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

    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: input.appId,
      title: input.title,
      generationSelection: windowRecord.generationSelection,
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
      generationSelection: windowRecord.generationSelection,
      status: windowRecord.status,
      revision: windowRecord.revisions.at(-1)?.revision ?? 0
    };
  }

  async requestUpdate(input: WindowActionInput): Promise<WindowSnapshot> {
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
    const generationSelection = await this.resolveWindowGenerationSelection({
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: windowRecord.appId,
      title: windowRecord.title,
      instruction: input.instruction
    });
    this.store.setGenerationSelection(input.sessionId, input.windowId, generationSelection);
    this.store.setLoading(input.sessionId, input.windowId);
    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      generationSelection,
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

  async requestPromptUpdate(input: {
    sessionId: string;
    windowId: string;
    prompt: string;
  }): Promise<WindowSnapshot> {
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
    const generationSelection = await this.resolveWindowGenerationSelection({
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: windowRecord.appId,
      title: windowRecord.title,
      instruction: instruction ?? normalizedPrompt
    });
    this.store.setGenerationSelection(input.sessionId, input.windowId, generationSelection);

    this.store.setLoading(input.sessionId, input.windowId);
    this.eventBus.publish({
      type: 'window-status',
      sessionId: input.sessionId,
      windowId: input.windowId,
      generationSelection,
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

  async regenerateWindowRevision(
    sessionId: string,
    windowId: string,
    targetRevision: number
  ): Promise<WindowSnapshot> {
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
      title,
      generationSelection: sourceRecord.generationSelection
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
      generationSelection: this.store.getWindow(sessionId, windowId)?.generationSelection,
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
    return buildWindowFallbackSource(record);
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
    const config = this.readConfig();
    const request = {
      sessionId,
      windowId,
      appId: record.appId,
      title: record.title,
      reason,
      instruction,
      promptOverride: hydratedPromptOverride,
      context: record.context,
      previousSource,
      onOutputChunk: config.llmStreamOutput
        ? ({ stream, chunk }: { stream: 'stdout' | 'stderr'; chunk: string }) => {
            if (this.getRollbackBarrier(sessionId, windowId) !== rollbackBarrier) {
              return;
            }
            this.eventBus.publish({
              type: 'llm-output',
              sessionId,
              windowId,
              stream,
              chunk
            });
          }
        : undefined
    } as const;

    const prompt = buildGenerationPrompt(request);
    try {
      const generated = await createLlmProvider(config).generate(request);
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

      if (this.persistedAppStore?.isManagedAppId(record.appId)) {
        try {
          await this.persistedAppStore.write({
            appId: record.appId,
            source: generated.source,
            revision: revision.revision,
            title: record.title
          });
        } catch (error) {
          const message = (error as Error).message;
          console.error('[aionios] failed to persist app revision', record.appId, error);
          this.store.addContextEntry(
            sessionId,
            windowId,
            createContextEntry('assistant', `Warning: unable to persist app source: ${message}`)
          );
        }
      }

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
        generationSelection: record.generationSelection,
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
        generationSelection: record.generationSelection,
        status: 'error',
        error: message
      });
    }
  }
}
