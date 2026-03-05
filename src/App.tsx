import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { closeWindow } from './api/client';
import { APP_CATALOG, getAppDefinition } from './app-catalog';
import { ContextMenu } from './components/ContextMenu';
import { DesktopIcons } from './components/DesktopIcons';
import { DesktopWallpaper } from './components/DesktopWallpaper';
import { QuickCreate } from './components/QuickCreate';
import { Taskbar } from './components/Taskbar';
import { PromptDialog } from './components/PromptDialog';
import { RevisionDialog } from './components/RevisionDialog';
import { LlmOutputDialog } from './components/LlmOutputDialog';
import { WindowFrame } from './components/WindowFrame';
import { WindowRuntimeWithHostBridge } from './components/WindowRuntimeWithHostBridge';
import { useAutoCloseDialogWhenWindowMissing } from './hooks/useAutoCloseDialogWhenWindowMissing';
import { useDesktopContextMenu } from './hooks/useDesktopContextMenu';
import { usePersistedApps } from './hooks/usePersistedApps';
import { usePromptDialogController } from './hooks/usePromptDialogController';
import { useSessionBootstrap } from './hooks/useSessionBootstrap';
import { useSessionWindowEvents } from './hooks/useSessionWindowEvents';
import { useWindowActions } from './hooks/useWindowActions';
import { type CanvasDimensions, initialState, reducer } from './state/app-state';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionRef = useRef(state.sessionId);
  const windowCanvasRef = useRef<HTMLElement | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [revisionDialog, setRevisionDialog] = useState<
    | { windowId: string; title: string }
    | null
  >(null);
  const [llmOutputDialog, setLlmOutputDialog] = useState<
    | { windowId: string; title: string }
    | null
  >(null);
  const {
    persistedAppDefinitionById,
    persistedAppDescriptorById,
    desktopPersistedAppDefinitions,
    refreshPersistedApps,
    upsertPersistedApp
  } = usePersistedApps();

  useSessionBootstrap({ dispatch });
  useSessionWindowEvents({ sessionId: state.sessionId, dispatch });
  useAutoCloseDialogWhenWindowMissing({
    windows: state.windows,
    dialog: revisionDialog,
    setDialog: setRevisionDialog
  });
  useAutoCloseDialogWhenWindowMissing({
    windows: state.windows,
    dialog: llmOutputDialog,
    setDialog: setLlmOutputDialog
  });

  useEffect(() => {
    sessionRef.current = state.sessionId;
  }, [state.sessionId]);

  const getWindowCanvasDimensions = useCallback((): CanvasDimensions | undefined => {
    const rect = windowCanvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }, []);

  const resolveAppDefinition = useCallback(
    (appId: string) => persistedAppDefinitionById.get(appId) ?? getAppDefinition(appId),
    [persistedAppDefinitionById]
  );

  const { openApp, openFile, createNewApp, requestUpdateForWindow, branchWindowFromRevision, trashVirtualPath } =
    useWindowActions({
      sessionId: state.sessionId,
      dispatch,
      getWindowCanvasDimensions,
      resolveAppDefinition,
      refreshPersistedApps,
      upsertPersistedApp
    });

  const {
    promptDialog,
    openCreateDialog,
    openOpenDialog,
    openUpdateDialog,
    closePromptDialog,
    onConfirmPrompt,
    promptDialogProps
  } = usePromptDialogController({
    openApp,
    createNewApp,
    requestUpdateForWindow
  });

  const { contextMenu, contextMenuItems, closeContextMenu, onContextMenu } = useDesktopContextMenu({
    openApp,
    openFile,
    refreshPersistedApps,
    trashVirtualPath,
    resolveAppDefinition,
    persistedAppDescriptorById,
    openCreateDialog,
    openOpenDialog
  });

  const toggleQuickCreate = useCallback(() => {
    closeContextMenu();
    closePromptDialog();
    setQuickCreateOpen((current) => !current);
  }, [closeContextMenu, closePromptDialog]);

  const orderedWindows = useMemo(
    () => [...state.windows].sort((left, right) => left.zIndex - right.zIndex),
    [state.windows]
  );

  const desktopApps = useMemo(
    () => [...APP_CATALOG, ...desktopPersistedAppDefinitions],
    [desktopPersistedAppDefinitions]
  );

  if (state.bootError) {
    return <div className="booting-shell">Unable to boot desktop: {state.bootError}</div>;
  }

  const activeSessionId = state.sessionId;

  if (!activeSessionId) {
    return <div className="booting-shell">Aionios is booting...</div>;
  }

  const revisionDialogWindow = revisionDialog
    ? state.windows.find((windowItem) => windowItem.windowId === revisionDialog.windowId)
    : undefined;

  const llmOutputDialogWindow = llmOutputDialog
    ? state.windows.find((windowItem) => windowItem.windowId === llmOutputDialog.windowId)
    : undefined;

  return (
    <div
      className="desktop-shell"
      onContextMenu={onContextMenu}
    >
      <div className="desktop-shell__workspace">
        <DesktopWallpaper wallpaper={state.wallpaper} />
        <div className="desktop-shell__items">
          <DesktopIcons apps={desktopApps} onOpenApp={openApp} />
        </div>
        <section ref={windowCanvasRef} className="window-canvas">
          {orderedWindows.map((windowItem) => {
            if (windowItem.minimized) {
              return null;
            }

            return (
              <WindowFrame
                key={`${windowItem.windowId}:${windowItem.mountNonce}`}
                windowItem={windowItem}
                showRevision={getAppDefinition(windowItem.appId)?.kind !== 'system'}
                focused={windowItem.windowId === state.focusedWindowId}
                onFocus={() => dispatch({ type: 'window-focus', windowId: windowItem.windowId })}
                onRequestHistory={
                  getAppDefinition(windowItem.appId)?.kind === 'system'
                    ? undefined
                    : () =>
                        setRevisionDialog({
                          windowId: windowItem.windowId,
                          title: windowItem.title
                        })
                }
                onRequestLlmOutput={
                  getAppDefinition(windowItem.appId)?.kind === 'system'
                    ? undefined
                    : () =>
                        setLlmOutputDialog({
                          windowId: windowItem.windowId,
                          title: windowItem.title
                        })
                }
                onRequestUpdate={
                  getAppDefinition(windowItem.appId)?.kind === 'system'
                    ? undefined
                    : () =>
                        openUpdateDialog({
                          windowId: windowItem.windowId,
                          title: windowItem.title
                        })
                }
                onBoundsChange={(bounds) =>
                  dispatch({
                    type: 'window-set-bounds',
                    windowId: windowItem.windowId,
                    bounds
                  })
                }
                onToggleMaximize={() =>
                  dispatch({
                    type: 'window-toggle-maximize',
                    windowId: windowItem.windowId
                  })
                }
                onMinimize={() =>
                  dispatch({
                    type: 'window-toggle-minimize',
                    windowId: windowItem.windowId
                  })
                }
                onClose={() => {
                  dispatch({
                    type: 'window-close',
                    windowId: windowItem.windowId
                  });
                  void closeWindow({
                    sessionId: activeSessionId,
                    windowId: windowItem.windowId
                  });
                }}
              >
                <WindowRuntimeWithHostBridge
                  windowItem={windowItem}
                  activeSessionId={activeSessionId}
                  openApp={openApp}
                  openFile={openFile}
                  requestUpdateForWindow={requestUpdateForWindow}
                  refreshPersistedApps={refreshPersistedApps}
                  sessionRef={sessionRef}
                  dispatch={dispatch}
                  terminalState={state.terminals[windowItem.windowId]}
                />
              </WindowFrame>
            );
          })}
        </section>
      </div>
      <Taskbar
        windows={orderedWindows}
        focusedWindowId={state.focusedWindowId}
        onStartClick={toggleQuickCreate}
        onWindowClick={(windowId) => {
          const target = state.windows.find((windowItem) => windowItem.windowId === windowId);
          if (!target) {
            return;
          }
          if (target.minimized) {
            dispatch({
              type: 'window-toggle-minimize',
              windowId
            });
          }
          dispatch({
            type: 'window-focus',
            windowId
          });
        }}
      />
      <QuickCreate
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onConfirm={(instruction) => {
          void createNewApp(instruction, '/');
        }}
      />
      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />
      <PromptDialog
        open={Boolean(promptDialog)}
        title={promptDialogProps.title}
        description={promptDialogProps.description}
        placeholder={promptDialogProps.placeholder}
        initialValue={promptDialogProps.initialValue}
        confirmLabel={promptDialogProps.confirmLabel}
        cancelLabel="Cancel"
        onClose={closePromptDialog}
        onConfirm={onConfirmPrompt}
      />
      <LlmOutputDialog
        open={Boolean(llmOutputDialog)}
        windowId={llmOutputDialog?.windowId ?? ''}
        title={llmOutputDialog?.title ?? ''}
        windowStatus={llmOutputDialogWindow?.status ?? 'ready'}
        output={
          llmOutputDialog?.windowId
            ? (state.llmOutputs[llmOutputDialog.windowId] ?? '')
            : ''
        }
        onClose={() => setLlmOutputDialog(null)}
        onClear={() => {
          if (!llmOutputDialog) {
            return;
          }
          dispatch({ type: 'llm-output-clear', windowId: llmOutputDialog.windowId });
        }}
      />
      <RevisionDialog
        open={Boolean(revisionDialog)}
        sessionId={activeSessionId}
        windowId={revisionDialog?.windowId ?? ''}
        title={revisionDialog?.title ?? ''}
        currentRevision={revisionDialogWindow?.revision ?? 0}
        windowStatus={revisionDialogWindow?.status ?? 'ready'}
        onClose={() => setRevisionDialog(null)}
        onBranch={async (revision) => {
          if (!revisionDialog) {
            throw new Error('Revision dialog is not active.');
          }
          await branchWindowFromRevision(revisionDialog.windowId, revision);
        }}
      />
    </div>
  );
}
