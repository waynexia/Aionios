import { useCallback } from 'react';
import {
  branchWindowRevision,
  createPersistedApp,
  listHostFiles,
  openWindow,
  readHostFile,
  requestWindowUpdate,
  trashHostFile,
  writeHostFile
} from '../api/client';
import type { AppAction, CanvasDimensions } from '../state/app-state';
import { windowErrorEvent, windowLifecycleEventFromSnapshot } from '../state/window-events';
import type { AppDefinition, PersistedAppDescriptor } from '../types';
import { dispatchFsChanged } from '../aionios-events';
import {
  buildFileOpenWindowTitle,
  isAppDescriptorPath,
  isMediaFilePath,
  parseAioniosAppDescriptor
} from '../open-file';
import {
  buildCreateNewFileContent,
  deriveFileBaseNameFromInstruction,
  deriveWindowTitleFromInstruction,
  inferCreateNewExtension,
  normalizeCreateNewDirectory,
  normalizeCreateNewExtension,
  pickUniqueVirtualPath,
  randomWindowId
} from '../window-actions/create-new';

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

  const openGeneratedWindow = useCallback(
    async (input: {
      windowId: string;
      appId: string;
      title: string;
      instruction?: string;
      canvas: CanvasDimensions | undefined;
    }) => {
      if (!sessionId) {
        return;
      }

      dispatch({
        type: 'window-open-local',
        windowId: input.windowId,
        sessionId,
        appId: input.appId,
        title: input.title,
        canvas: input.canvas
      });

      try {
        const snapshot = await openWindow({
          sessionId,
          windowId: input.windowId,
          appId: input.appId,
          title: input.title,
          instruction: input.instruction
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
            windowId: input.windowId,
            error: (error as Error).message
          })
        });
      }
    },
    [dispatch, sessionId]
  );

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

      await openGeneratedWindow({
        windowId,
        appId,
        title,
        instruction: normalizedInstruction,
        canvas
      });
    },
    [
      getWindowCanvasDimensions,
      openGeneratedWindow,
      openSystemWindow,
      resolveAppDefinition,
      sessionId
    ]
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

      if (isAppDescriptorPath(normalizedPath)) {
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

      const extension = normalizeCreateNewExtension(inferCreateNewExtension(instruction));
      if (extension !== '.app') {
        const normalizedDirectory = normalizeCreateNewDirectory(directory);
        const directoryForEvent = normalizedDirectory.length > 0 ? normalizedDirectory : '/';
        const title = deriveFileBaseNameFromInstruction(instruction, extension);
        let existingPaths = new Set<string>();
        try {
          const { files } = await listHostFiles();
          existingPaths = new Set(files.map((file) => file.path));
        } catch (error) {
          console.warn('[aionios] unable to list host files for Create New', error);
        }

        let virtualPath: string;
        try {
          virtualPath = pickUniqueVirtualPath({
            existingPaths,
            directory: normalizedDirectory,
            baseName: title,
            extension
          });
        } catch (error) {
          console.warn('[aionios] unable to choose a unique file path for Create New', error);
          return;
        }

        const content = buildCreateNewFileContent({ instruction, extension, title });
        try {
          await writeHostFile({ path: virtualPath, content });
          dispatchFsChanged({ action: 'refresh', path: directoryForEvent });
          await openFile(virtualPath);
        } catch (error) {
          console.warn('[aionios] unable to write Create New file', virtualPath, error);
        }
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
      await openGeneratedWindow({
        windowId,
        appId,
        title: resolvedTitle,
        instruction: normalizedInstruction,
        canvas
      });
    },
    [
      getWindowCanvasDimensions,
      openFile,
      openGeneratedWindow,
      refreshPersistedApps,
      sessionId,
      upsertPersistedApp
    ]
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
      if (isAppDescriptorPath(trashed.originalPath)) {
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
