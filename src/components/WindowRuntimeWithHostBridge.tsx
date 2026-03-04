import { useMemo } from 'react';
import {
  deleteRecycleBinItem,
  emptyRecycleBin,
  getPreferenceConfig,
  listHostFiles,
  listRecycleBinItems,
  readHostFile,
  restoreRecycleBinItem,
  sendTerminalInput,
  startTerminal,
  stopTerminal,
  trashHostFile,
  updatePreferenceConfig,
  writeHostFile
} from '../api/client';
import { dispatchFsChanged } from '../aionios-events';
import type { AppAction } from '../state/app-state';
import type { DesktopWindow, HostBridge, TerminalStateSnapshot } from '../types';
import { WindowRuntime } from './WindowRuntime';

export interface WindowRuntimeWithHostBridgeProps {
  activeSessionId: string;
  windowItem: DesktopWindow;
  terminalState?: TerminalStateSnapshot;
  sessionRef: { current: string | undefined };
  dispatch: (action: AppAction) => void;
  openApp: (appId: string, instruction?: string) => Promise<void>;
  openFile: (virtualPath: string) => Promise<void>;
  requestUpdateForWindow: (windowId: string, instruction: string) => Promise<void>;
  refreshPersistedApps: () => Promise<void>;
}

export function WindowRuntimeWithHostBridge({
  activeSessionId,
  windowItem,
  terminalState,
  sessionRef,
  dispatch,
  openApp,
  openFile,
  requestUpdateForWindow,
  refreshPersistedApps
}: WindowRuntimeWithHostBridgeProps) {
  const hostBridge = useMemo<HostBridge>(
    () => ({
      sessionId: activeSessionId,
      windowId: windowItem.windowId,
      appId: windowItem.appId,
      openApp: async (appId) => {
        await openApp(appId);
      },
      openFile: async (path) => {
        await openFile(path);
      },
      readFile: async (path) => (await readHostFile({ path })).content,
      writeFile: async (path, content) => {
        await writeHostFile({ path, content });
      },
      requestUpdate: async (instruction) => {
        await requestUpdateForWindow(windowItem.windowId, instruction);
      },
      listFiles: async () => (await listHostFiles()).files,
      preference: {
        read: async () => getPreferenceConfig(),
        update: async (input) => updatePreferenceConfig(input)
      },
      terminal: {
        start: async () => {
          const currentSessionId = sessionRef.current;
          if (!currentSessionId) {
            return;
          }
          const metadata = await startTerminal({
            sessionId: currentSessionId,
            windowId: windowItem.windowId
          });
          dispatch({
            type: 'window-server-event',
            event: {
              type: 'terminal-status',
              sessionId: currentSessionId,
              windowId: windowItem.windowId,
              status: 'running',
              shell: metadata.shell,
              cwd: metadata.cwd
            }
          });
        },
        sendInput: async (input) => {
          const currentSessionId = sessionRef.current;
          if (!currentSessionId) {
            return;
          }
          await sendTerminalInput({
            sessionId: currentSessionId,
            windowId: windowItem.windowId,
            payload: input
          });
        },
        stop: async () => {
          const currentSessionId = sessionRef.current;
          if (!currentSessionId) {
            return;
          }
          await stopTerminal({
            sessionId: currentSessionId,
            windowId: windowItem.windowId
          });
        }
      },
      recycleBin: {
        listItems: async () => (await listRecycleBinItems()).items,
        trash: async (path) => {
          const trashed = await trashHostFile({ path });
          dispatchFsChanged({ action: 'trash', path: trashed.originalPath });
          if (trashed.originalPath.endsWith('.aionios-app.json')) {
            await refreshPersistedApps();
          }
          return trashed;
        },
        restore: async (id) => {
          const restored = await restoreRecycleBinItem({ id });
          dispatchFsChanged({ action: 'restore', path: restored.restoredPath });
          if (restored.restoredPath.endsWith('.aionios-app.json')) {
            await refreshPersistedApps();
          }
          return restored;
        },
        deleteItem: async (id) => {
          await deleteRecycleBinItem({ id });
        },
        empty: async () => emptyRecycleBin()
      }
    }),
    [
      activeSessionId,
      dispatch,
      openApp,
      openFile,
      refreshPersistedApps,
      requestUpdateForWindow,
      sessionRef,
      windowItem.appId,
      windowItem.windowId
    ]
  );

  return <WindowRuntime windowItem={windowItem} hostBridge={hostBridge} terminalState={terminalState} />;
}
