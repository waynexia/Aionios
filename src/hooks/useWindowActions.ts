import { useCallback } from 'react';
import {
  branchWindowRevision,
  createPersistedApp,
  openWindow,
  requestWindowUpdate,
  trashHostFile
} from '../api/client';
import type { AppAction, CanvasDimensions } from '../state/app-state';
import { windowErrorEvent, windowLifecycleEventFromSnapshot } from '../state/window-events';
import type { AppDefinition, PersistedAppDescriptor } from '../types';
import { dispatchFsChanged } from '../aionios-events';

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
        try {
          const snapshot = await openWindow({
            sessionId,
            windowId,
            appId,
            title
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
            canvas
          });
        } catch (error) {
          dispatch({
            type: 'window-open-local',
            windowId,
            sessionId,
            appId,
            title,
            initialStatus: 'error',
            initialError: (error as Error).message,
            canvas
          });
        }
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
    [dispatch, getWindowCanvasDimensions, resolveAppDefinition, sessionId]
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
    createNewApp,
    requestUpdateForWindow,
    branchWindowFromRevision,
    trashVirtualPath
  };
}
