import { useCallback } from 'react';
import {
  branchWindowRevision,
  createPersistedApp,
  openWindow,
  readHostFile,
  requestWindowUpdate,
  trashHostFile
} from '../api/client';
import type { AppAction, CanvasDimensions } from '../state/app-state';
import { windowErrorEvent, windowLifecycleEventFromSnapshot } from '../state/window-events';
import type { AppDefinition, PersistedAppDescriptor } from '../types';
import { dispatchFsChanged } from '../aionios-events';
import {
  APP_DESCRIPTOR_EXTENSION,
  buildFileOpenWindowTitle,
  isMediaFilePath,
  parseAioniosAppDescriptor
} from '../open-file';

function randomWindowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `window-${Math.random().toString(36).slice(2, 11)}`;
}

function deriveWindowTitleFromInstruction(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return 'New App';
  }
  const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  const maxLength = 42;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

export function useWindowActions(options: {
  sessionId: string | undefined;
  dispatch: (action: AppAction) => void;
  getWindowCanvasDimensions: () => CanvasDimensions | undefined;
  resolveAppDefinition: (appId: string) => AppDefinition | undefined;
  refreshPersistedApps: () => Promise<void>;
  upsertPersistedApp: (descriptor: PersistedAppDescriptor) => void;
}) {
  const {
    dispatch,
    getWindowCanvasDimensions,
    refreshPersistedApps,
    resolveAppDefinition,
    sessionId,
    upsertPersistedApp
  } = options;

  const openSystemWindow = useCallback(
    async (input: { appId: string; title: string; windowId?: string; launch?: { kind: 'open-file'; path: string } }) => {
      if (!sessionId) {
        return;
      }
      const windowId = input.windowId ?? randomWindowId();
      const canvas = getWindowCanvasDimensions();
      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId: input.appId,
          title: input.title
        });
        dispatch({
          type: 'window-open-local',
          windowId,
          sessionId: snapshot.sessionId,
          appId: snapshot.appId,
          title: snapshot.title,
          initialStatus: snapshot.status,
          initialRevision: snapshot.revision,
          initialError: snapshot.error,
          launch: input.launch,
          canvas
        });
      } catch (error) {
        dispatch({
          type: 'window-open-local',
          windowId,
          sessionId,
          appId: input.appId,
          title: input.title,
          initialStatus: 'error',
          initialError: (error as Error).message,
          launch: input.launch,
          canvas
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, sessionId]
  );

  const requestUpdateForWindow = useCallback(
    async (windowId: string, instruction: string) => {
      if (!sessionId) {
        return;
      }
      await requestWindowUpdate({
        sessionId,
        windowId,
        instruction
      });
    },
    [sessionId]
  );

  const openApp = useCallback(
    async (appId: string, instruction?: string) => {
      if (!sessionId) {
        return;
      }
      const definition = resolveAppDefinition(appId);
      const title = definition?.title ?? `App ${appId}`;
      const windowId = randomWindowId();
      const isSystemApp = definition?.kind === 'system';
      const canvas = getWindowCanvasDimensions();
      const normalizedInstruction = instruction?.trim() ? instruction.trim() : undefined;

      if (isSystemApp) {
        await openSystemWindow({
          windowId,
          appId,
          title
        });
        return;
      }

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId,
        appId,
        title,
        canvas
      });
      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId,
          title,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: windowLifecycleEventFromSnapshot(snapshot, 'remount')
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: windowErrorEvent({
            sessionId,
            windowId,
            error: (error as Error).message
          })
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, openSystemWindow, resolveAppDefinition, sessionId]
  );

  const openFile = useCallback(
    async (virtualPath: string) => {
      if (!sessionId) {
        return;
      }

      const trimmed = virtualPath.replaceAll('\\', '/').trim();
      const withoutPrefix = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
      const normalizedPath = withoutPrefix.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      if (!normalizedPath) {
        return;
      }

      if (normalizedPath.endsWith(APP_DESCRIPTOR_EXTENSION)) {
        try {
          const content = await readHostFile({ path: normalizedPath });
          const parsed = parseAioniosAppDescriptor(content.content);
          if (parsed) {
            await refreshPersistedApps();
            await openApp(parsed.appId);
            return;
          }
        } catch {
          // fall through to open the descriptor as a plain JSON file
        }
      }

      const targetSystemAppId = isMediaFilePath(normalizedPath) ? 'media' : 'editor';
      const definition = resolveAppDefinition(targetSystemAppId);
      const appTitle = definition?.title ?? targetSystemAppId;
      const title = buildFileOpenWindowTitle({ appTitle, path: normalizedPath });
      await openSystemWindow({
        appId: targetSystemAppId,
        title,
        launch: { kind: 'open-file', path: normalizedPath }
      });
    },
    [openApp, openSystemWindow, refreshPersistedApps, resolveAppDefinition, sessionId]
  );

  const createNewApp = useCallback(
    async (instruction: string, directory: string) => {
      if (!sessionId) {
        return;
      }

      const normalizedInstruction = instruction.trim() ? instruction.trim() : undefined;
      const windowId = randomWindowId();
      const title = deriveWindowTitleFromInstruction(instruction);
      const canvas = getWindowCanvasDimensions();

      let descriptor: PersistedAppDescriptor | null = null;
      try {
        descriptor = await createPersistedApp({
          directory,
          title
        });
        upsertPersistedApp(descriptor);
        await refreshPersistedApps();
      } catch (error) {
        console.warn('[aionios] unable to persist Create New app, falling back to ephemeral window', error);
      }

      const appId = descriptor?.appId ?? 'custom';
      const resolvedTitle = descriptor?.title ?? title;

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId,
        appId,
        title: resolvedTitle,
        canvas
      });

      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId,
          title: resolvedTitle,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: windowLifecycleEventFromSnapshot(snapshot, 'remount')
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: windowErrorEvent({
            sessionId,
            windowId,
            error: (error as Error).message
          })
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, refreshPersistedApps, sessionId, upsertPersistedApp]
  );

  const branchWindowFromRevision = useCallback(
    async (sourceWindowId: string, revision: number) => {
      if (!sessionId) {
        throw new Error('No active session.');
      }
      const newWindowId = randomWindowId();
      const canvas = getWindowCanvasDimensions();
      const snapshot = await branchWindowRevision({
        sessionId,
        windowId: sourceWindowId,
        revision,
        newWindowId
      });
      dispatch({
        type: 'window-open-local',
        windowId: newWindowId,
        sessionId: snapshot.sessionId,
        appId: snapshot.appId,
        title: snapshot.title,
        initialStatus: snapshot.status,
        initialRevision: snapshot.revision,
        initialError: snapshot.error,
        canvas
      });
    },
    [dispatch, getWindowCanvasDimensions, sessionId]
  );

  const trashVirtualPath = useCallback(
    async (virtualPath: string) => {
      const trashed = await trashHostFile({ path: virtualPath });
      dispatchFsChanged({ action: 'trash', path: trashed.originalPath });
      if (trashed.originalPath.endsWith('.aionios-app.json')) {
        await refreshPersistedApps();
      }
    },
    [refreshPersistedApps]
  );

  return {
    openApp,
    openFile,
    createNewApp,
    requestUpdateForWindow,
    branchWindowFromRevision,
    trashVirtualPath
  };
}
