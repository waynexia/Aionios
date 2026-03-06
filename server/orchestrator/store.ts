import type {
  ContextEntry,
  OpenWindowInput,
  SessionRecord,
  SourceSnapshot,
  UpdateStrategy,
  WindowGenerationSelection,
  WindowRecord,
  WindowRevision,
  WindowSnapshot
} from './types';

function nowIso() {
  return new Date().toISOString();
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  createSession(sessionId: string): SessionRecord {
    const createdAt = nowIso();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }
    const session: SessionRecord = {
      sessionId,
      createdAt,
      windows: new Map()
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  createWindow(input: OpenWindowInput): WindowRecord {
    const session = this.createSession(input.sessionId);
    const createdAt = nowIso();
    const existing = session.windows.get(input.windowId);
    if (existing) {
      return existing;
    }
    const windowRecord: WindowRecord = {
      sessionId: input.sessionId,
      windowId: input.windowId,
      appId: input.appId,
      title: input.title,
      generationSelection: input.generationSelection,
      status: 'loading',
      createdAt,
      updatedAt: createdAt,
      revisions: [],
      headRevision: null,
      context: []
    };
    session.windows.set(windowRecord.windowId, windowRecord);
    return windowRecord;
  }

  getWindow(sessionId: string, windowId: string): WindowRecord | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return session.windows.get(windowId);
  }

  deleteWindow(sessionId: string, windowId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    const removed = session.windows.delete(windowId);
    if (session.windows.size === 0) {
      this.sessions.delete(sessionId);
    }
    return removed;
  }

  listWindows(sessionId: string): WindowSnapshot[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }
    return Array.from(session.windows.values()).map((windowRecord) => ({
      sessionId: windowRecord.sessionId,
      windowId: windowRecord.windowId,
      appId: windowRecord.appId,
      title: windowRecord.title,
      generationSelection: windowRecord.generationSelection,
      status: windowRecord.status,
      revision: this.getCurrentRevisionForRecord(windowRecord)?.revision ?? 0,
      error: windowRecord.error
    }));
  }

  setLoading(sessionId: string, windowId: string) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.status = 'loading';
    windowRecord.error = undefined;
    windowRecord.updatedAt = nowIso();
  }

  setError(sessionId: string, windowId: string, error: string) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.status = 'error';
    windowRecord.error = error;
    windowRecord.updatedAt = nowIso();
  }

  setTitle(sessionId: string, windowId: string, title: string) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.title = title;
    windowRecord.updatedAt = nowIso();
  }

  setGenerationSelection(
    sessionId: string,
    windowId: string,
    generationSelection: WindowGenerationSelection | undefined
  ) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.generationSelection = generationSelection;
    windowRecord.updatedAt = nowIso();
  }

  addContextEntry(sessionId: string, windowId: string, entry: ContextEntry) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.context.push(entry);
    if (windowRecord.context.length > 30) {
      windowRecord.context.splice(0, windowRecord.context.length - 30);
    }
    windowRecord.updatedAt = nowIso();
  }

  addRevision(
    sessionId: string,
    windowId: string,
    revisionSource: string,
    prompt: string,
    backend: string,
    strategy: UpdateStrategy
  ): WindowRevision {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    const nextRevision = (windowRecord.revisions.at(-1)?.revision ?? 0) + 1;
    const revision: WindowRevision = {
      revision: nextRevision,
      source: revisionSource,
      prompt,
      strategy,
      backend,
      generatedAt: nowIso()
    };
    windowRecord.revisions.push(revision);
    windowRecord.headRevision = revision.revision;
    windowRecord.status = 'ready';
    windowRecord.error = undefined;
    windowRecord.updatedAt = revision.generatedAt;
    return revision;
  }

  loadRevision(sessionId: string, windowId: string, revision: WindowRevision) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    windowRecord.revisions = [revision];
    windowRecord.headRevision = revision.revision;
    windowRecord.status = 'ready';
    windowRecord.error = undefined;
    windowRecord.updatedAt = revision.generatedAt;
  }

  moveHeadToRevision(sessionId: string, windowId: string, targetRevision: number) {
    const windowRecord = this.mustGetWindow(sessionId, windowId);
    const revision = this.findRevision(windowRecord, targetRevision);
    if (!revision) {
      throw new Error(`Revision ${targetRevision} not found`);
    }
    windowRecord.headRevision = revision.revision;
    windowRecord.status = 'ready';
    windowRecord.error = undefined;
    windowRecord.updatedAt = nowIso();
    return revision;
  }

  getCurrentRevision(sessionId: string, windowId: string): WindowRevision | undefined {
    const windowRecord = this.getWindow(sessionId, windowId);
    if (!windowRecord) {
      return undefined;
    }
    return this.getCurrentRevisionForRecord(windowRecord);
  }

  getWindowSource(sessionId: string, windowId: string): SourceSnapshot | undefined {
    const revision = this.getCurrentRevision(sessionId, windowId);
    if (!revision) {
      return undefined;
    }
    return {
      revision: revision.revision,
      source: revision.source
    };
  }

  private mustGetWindow(sessionId: string, windowId: string): WindowRecord {
    const windowRecord = this.getWindow(sessionId, windowId);
    if (!windowRecord) {
      throw new Error(`Window ${sessionId}/${windowId} does not exist`);
    }
    return windowRecord;
  }

  private findRevision(windowRecord: WindowRecord, targetRevision: number) {
    return windowRecord.revisions.find((entry) => entry.revision === targetRevision);
  }

  private getCurrentRevisionForRecord(windowRecord: WindowRecord): WindowRevision | undefined {
    const headRevision = windowRecord.headRevision ?? windowRecord.revisions.at(-1)?.revision;
    if (typeof headRevision !== 'number') {
      return undefined;
    }
    return this.findRevision(windowRecord, headRevision);
  }
}
