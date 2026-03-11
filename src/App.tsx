import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent
} from 'react';
import { closeWindow } from './api/client';
import { APP_CATALOG, getAppDefinition } from './app-catalog';
import { ContextMenu } from './components/ContextMenu';
import { DesktopIcons } from './components/DesktopIcons';
import { DesktopWallpaper } from './components/DesktopWallpaper';
import { LlmOutputDialog } from './components/LlmOutputDialog';
import { MobileStatusBar } from './components/MobileStatusBar';
import { MobileSystemNav } from './components/MobileSystemNav';
import { MobileTaskSwitcher } from './components/MobileTaskSwitcher';
import { PromptDialog } from './components/PromptDialog';
import { RevisionDialog } from './components/RevisionDialog';
import { Taskbar } from './components/Taskbar';
import { WindowFrame } from './components/WindowFrame';
import { WindowRuntimeWithHostBridge } from './components/WindowRuntimeWithHostBridge';
import { useAutoCloseDialogWhenWindowMissing } from './hooks/useAutoCloseDialogWhenWindowMissing';
import { useCompactViewport } from './hooks/useCompactViewport';
import { useDesktopContextMenu } from './hooks/useDesktopContextMenu';
import { usePersistedApps } from './hooks/usePersistedApps';
import { usePromptDialogController } from './hooks/usePromptDialogController';
import { useSessionBootstrap } from './hooks/useSessionBootstrap';
import { useSessionWindowEvents } from './hooks/useSessionWindowEvents';
import { useWindowActions } from './hooks/useWindowActions';
import {
  getMobileBackTarget,
  getNextMobileForegroundAfterClose,
  getRenderableMobileWindowId
} from './mobile/shell';
import { type CanvasDimensions, initialState, reducer } from './state/app-state';

const MOBILE_LONG_PRESS_MS = 460;
const MOBILE_LONG_PRESS_MOVE_PX = 10;
const MOBILE_EDGE_SWIPE_ZONE_PX = 24;
const MOBILE_EDGE_SWIPE_TRIGGER_PX = 78;
const MOBILE_HOME_SWIPE_ZONE_PX = 28;
const MOBILE_HOME_SWIPE_TRIGGER_PX = 100;
const MOBILE_SUPPRESSED_CLICK_MS = 260;

type MobileSurface = 'home' | 'app' | 'recents';

interface MobileLongPressSession {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  target: Element;
  timerId: number;
}

interface MobileGestureSession {
  pointerId: number;
  zone: 'back-left' | 'back-right' | 'home';
  startX: number;
  startY: number;
  triggered: boolean;
}

function shouldKeepNativeContextMenuTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, option, [contenteditable], .xterm'));
}

function canOpenTouchContextMenu(target: Element | null) {
  if (!target || shouldKeepNativeContextMenuTarget(target)) {
    return false;
  }
  if (
    target.closest(
      '.mobile-home-action, [data-mobile-system-nav], [data-context-menu], [data-prompt-dialog], [data-revision-dialog], [data-llm-output-dialog]'
    )
  ) {
    return false;
  }
  if (
    target.closest(
      '[data-directory-entry-path], [data-directory-group], [data-directory-app], [data-recycle-bin-item-id], [data-recycle-bin-app]'
    )
  ) {
    return true;
  }
  if (target.closest('.window-frame')) {
    return false;
  }
  if (target.closest('.desktop-icon[data-app-id]')) {
    return true;
  }
  return Boolean(target.closest('.desktop-shell__workspace'));
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionRef = useRef(state.sessionId);
  const windowCanvasRef = useRef<HTMLElement | null>(null);
  const previousFocusedWindowIdRef = useRef<string | undefined>();
  const mobileLongPressRef = useRef<MobileLongPressSession | null>(null);
  const mobileGestureRef = useRef<MobileGestureSession | null>(null);
  const mobileTouchTransportRef = useRef<'pointer' | 'touch' | null>(null);
  const suppressTouchClickUntilRef = useRef(0);
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>('home');
  const [mobileForegroundWindowId, setMobileForegroundWindowId] = useState<string | null>(null);
  const [revisionDialog, setRevisionDialog] = useState<
    | { windowId: string; title: string }
    | null
  >(null);
  const [llmOutputDialog, setLlmOutputDialog] = useState<
    | { windowId: string; title: string }
    | null
  >(null);
  const isCompactViewport = useCompactViewport();
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

  const {
    openApp,
    openFile,
    createNewApp,
    requestUpdateForWindow,
    branchWindowFromRevision,
    trashVirtualPath
  } = useWindowActions({
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

  const {
    contextMenu,
    contextMenuItems,
    closeContextMenu,
    openContextMenuAt,
    onContextMenu
  } = useDesktopContextMenu({
    openApp,
    openFile,
    refreshPersistedApps,
    trashVirtualPath,
    resolveAppDefinition,
    persistedAppDescriptorById,
    openCreateDialog,
    openOpenDialog
  });

  const openTaskbarCreateDialog = useCallback(() => {
    closeContextMenu();
    openCreateDialog('/');
  }, [closeContextMenu, openCreateDialog]);

  const orderedWindows = useMemo(
    () => [...state.windows].sort((left, right) => left.zIndex - right.zIndex),
    [state.windows]
  );

  const orderedWindowsByRecency = useMemo(
    () => [...orderedWindows].sort((left, right) => right.zIndex - left.zIndex),
    [orderedWindows]
  );

  const desktopApps = useMemo(
    () => [...APP_CATALOG, ...desktopPersistedAppDefinitions],
    [desktopPersistedAppDefinitions]
  );

  const getWindowIcon = useCallback(
    (windowItem: { appId: string; generationSelection?: { emoji: string } }) =>
      windowItem.generationSelection?.emoji ?? resolveAppDefinition(windowItem.appId)?.icon ?? '🧩',
    [resolveAppDefinition]
  );

  const mobileVisibleWindowId =
    isCompactViewport && mobileSurface === 'app'
      ? getRenderableMobileWindowId(
          state.windows,
          mobileForegroundWindowId ?? undefined,
          state.focusedWindowId
        )
      : null;

  useEffect(() => {
    if (!isCompactViewport) {
      setMobileSurface('app');
      return;
    }
    if (state.windows.length === 0) {
      setMobileForegroundWindowId(null);
      setMobileSurface('home');
      return;
    }
    if (mobileForegroundWindowId && state.windows.some((windowItem) => windowItem.windowId === mobileForegroundWindowId)) {
      return;
    }
    const nextWindowId = getRenderableMobileWindowId(
      state.windows,
      mobileForegroundWindowId ?? undefined,
      state.focusedWindowId
    );
    setMobileForegroundWindowId(nextWindowId);
    setMobileSurface(nextWindowId ? 'app' : 'home');
  }, [isCompactViewport, state.windows, state.focusedWindowId, mobileForegroundWindowId]);

  useEffect(() => {
    if (!isCompactViewport) {
      previousFocusedWindowIdRef.current = state.focusedWindowId;
      return;
    }
    const previousFocusedWindowId = previousFocusedWindowIdRef.current;
    previousFocusedWindowIdRef.current = state.focusedWindowId;
    if (!state.focusedWindowId || state.focusedWindowId === previousFocusedWindowId) {
      return;
    }
    setMobileForegroundWindowId(state.focusedWindowId);
    setMobileSurface((currentSurface) => (currentSurface === 'recents' ? currentSurface : 'app'));
  }, [isCompactViewport, state.focusedWindowId]);

  useEffect(() => {
    if (!isCompactViewport) {
      return;
    }
    if (mobileSurface === 'app' && !mobileVisibleWindowId) {
      setMobileSurface('home');
    }
  }, [isCompactViewport, mobileSurface, mobileVisibleWindowId]);

  const focusWindow = useCallback(
    (windowId: string) => {
      const target = state.windows.find((windowItem) => windowItem.windowId === windowId);
      if (!target) {
        return;
      }
      closeContextMenu();
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
      if (isCompactViewport) {
        setMobileForegroundWindowId(windowId);
        setMobileSurface('app');
      }
    },
    [closeContextMenu, dispatch, isCompactViewport, state.windows]
  );

  const closeDesktopWindow = useCallback(
    (windowId: string) => {
      const nextForegroundWindowId = getNextMobileForegroundAfterClose(
        state.windows,
        windowId,
        mobileForegroundWindowId ?? state.focusedWindowId
      );
      const closingVisibleMobileWindow = mobileVisibleWindowId === windowId && mobileSurface === 'app';

      dispatch({
        type: 'window-close',
        windowId
      });

      if (isCompactViewport) {
        if (nextForegroundWindowId) {
          setMobileForegroundWindowId(nextForegroundWindowId);
          if (closingVisibleMobileWindow) {
            dispatch({
              type: 'window-focus',
              windowId: nextForegroundWindowId
            });
          }
        } else {
          setMobileForegroundWindowId(null);
          setMobileSurface('home');
        }
      }

      if (state.sessionId) {
        void closeWindow({
          sessionId: state.sessionId,
          windowId
        });
      }
    },
    [
      dispatch,
      isCompactViewport,
      mobileForegroundWindowId,
      mobileSurface,
      mobileVisibleWindowId,
      state.focusedWindowId,
      state.sessionId,
      state.windows
    ]
  );

  const closeTransientUi = useCallback(() => {
    if (contextMenu) {
      closeContextMenu();
      return true;
    }
    if (promptDialog) {
      closePromptDialog();
      return true;
    }
    if (llmOutputDialog) {
      setLlmOutputDialog(null);
      return true;
    }
    if (revisionDialog) {
      setRevisionDialog(null);
      return true;
    }
    return false;
  }, [
    closeContextMenu,
    closePromptDialog,
    contextMenu,
    llmOutputDialog,
    promptDialog,
    revisionDialog
  ]);

  const handleMobileBack = useCallback(() => {
    if (closeTransientUi()) {
      return;
    }
    if (mobileSurface === 'recents') {
      setMobileSurface(mobileVisibleWindowId ? 'app' : 'home');
      return;
    }
    if (mobileSurface === 'home') {
      return;
    }
    const nextWindowId = getMobileBackTarget(
      state.windows,
      mobileVisibleWindowId ?? undefined
    );
    if (nextWindowId) {
      focusWindow(nextWindowId);
      return;
    }
    setMobileSurface('home');
  }, [closeTransientUi, focusWindow, mobileSurface, mobileVisibleWindowId, state.windows]);

  const handleMobileHome = useCallback(() => {
    closeContextMenu();
    closePromptDialog();
    setRevisionDialog(null);
    setLlmOutputDialog(null);
    setMobileSurface('home');
  }, [closeContextMenu, closePromptDialog]);

  const handleMobileRecents = useCallback(() => {
    closeContextMenu();
    closePromptDialog();
    setRevisionDialog(null);
    setLlmOutputDialog(null);
    if (state.windows.length === 0) {
      setMobileSurface('home');
      return;
    }
    setMobileSurface((currentSurface) =>
      currentSurface === 'recents' ? (mobileVisibleWindowId ? 'app' : 'home') : 'recents'
    );
  }, [closeContextMenu, closePromptDialog, mobileVisibleWindowId, state.windows.length]);

  const clearMobileLongPress = useCallback(() => {
    const session = mobileLongPressRef.current;
    if (!session) {
      return;
    }
    window.clearTimeout(session.timerId);
    mobileLongPressRef.current = null;
  }, []);

  const clearMobileGesture = useCallback(() => {
    mobileGestureRef.current = null;
  }, []);

  const beginMobileTouchInteraction = useCallback(
    (input: { pointerId: number; x: number; y: number; target: Element | null }) => {
      clearMobileLongPress();
      clearMobileGesture();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (!contextMenu && !promptDialog && !revisionDialog && !llmOutputDialog) {
        if (input.x <= MOBILE_EDGE_SWIPE_ZONE_PX) {
          mobileGestureRef.current = {
            pointerId: input.pointerId,
            zone: 'back-left',
            startX: input.x,
            startY: input.y,
            triggered: false
          };
        } else if (input.x >= viewportWidth - MOBILE_EDGE_SWIPE_ZONE_PX) {
          mobileGestureRef.current = {
            pointerId: input.pointerId,
            zone: 'back-right',
            startX: input.x,
            startY: input.y,
            triggered: false
          };
        } else if (input.y >= viewportHeight - MOBILE_HOME_SWIPE_ZONE_PX) {
          mobileGestureRef.current = {
            pointerId: input.pointerId,
            zone: 'home',
            startX: input.x,
            startY: input.y,
            triggered: false
          };
        }
      }

      if (!input.target || !canOpenTouchContextMenu(input.target)) {
        return;
      }

      const timerId = window.setTimeout(() => {
        suppressTouchClickUntilRef.current = Date.now() + MOBILE_SUPPRESSED_CLICK_MS;
        mobileLongPressRef.current = null;
        openContextMenuAt({
          target: input.target,
          x: input.x,
          y: input.y
        });
      }, MOBILE_LONG_PRESS_MS);

      mobileLongPressRef.current = {
        pointerId: input.pointerId,
        startX: input.x,
        startY: input.y,
        x: input.x,
        y: input.y,
        target: input.target,
        timerId
      };
    },
    [
      clearMobileGesture,
      clearMobileLongPress,
      contextMenu,
      llmOutputDialog,
      openContextMenuAt,
      promptDialog,
      revisionDialog
    ]
  );

  const updateMobileTouchInteraction = useCallback(
    (input: { pointerId: number; x: number; y: number; preventDefault?: () => void }) => {
      const longPressSession = mobileLongPressRef.current;
      if (longPressSession && longPressSession.pointerId === input.pointerId) {
        const movedDistance = Math.hypot(
          input.x - longPressSession.startX,
          input.y - longPressSession.startY
        );
        if (movedDistance > MOBILE_LONG_PRESS_MOVE_PX) {
          clearMobileLongPress();
        }
      }

      const gestureSession = mobileGestureRef.current;
      if (!gestureSession || gestureSession.pointerId !== input.pointerId || gestureSession.triggered) {
        return;
      }

      const deltaX = input.x - gestureSession.startX;
      const deltaY = input.y - gestureSession.startY;

      if (
        (gestureSession.zone === 'back-left' &&
          deltaX >= MOBILE_EDGE_SWIPE_TRIGGER_PX &&
          Math.abs(deltaY) <= Math.abs(deltaX) * 0.7) ||
        (gestureSession.zone === 'back-right' &&
          deltaX <= -MOBILE_EDGE_SWIPE_TRIGGER_PX &&
          Math.abs(deltaY) <= Math.abs(deltaX) * 0.7)
      ) {
        gestureSession.triggered = true;
        clearMobileLongPress();
        input.preventDefault?.();
        handleMobileBack();
        return;
      }

      if (
        gestureSession.zone === 'home' &&
        deltaY <= -MOBILE_HOME_SWIPE_TRIGGER_PX &&
        Math.abs(deltaY) > Math.abs(deltaX)
      ) {
        gestureSession.triggered = true;
        clearMobileLongPress();
        input.preventDefault?.();
        handleMobileHome();
      }
    },
    [clearMobileLongPress, handleMobileBack, handleMobileHome]
  );

  const endMobileTouchInteraction = useCallback(
    (pointerId: number) => {
      const longPressSession = mobileLongPressRef.current;
      if (longPressSession?.pointerId === pointerId) {
        clearMobileLongPress();
      }
      const gestureSession = mobileGestureRef.current;
      if (gestureSession?.pointerId === pointerId) {
        clearMobileGesture();
      }
      if (!mobileLongPressRef.current && !mobileGestureRef.current) {
        mobileTouchTransportRef.current = null;
      }
    },
    [clearMobileGesture, clearMobileLongPress]
  );

  const handleShellPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCompactViewport || event.pointerType !== 'touch') {
        return;
      }
      mobileTouchTransportRef.current = 'pointer';
      beginMobileTouchInteraction({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target: event.target instanceof Element ? event.target : null
      });
    },
    [beginMobileTouchInteraction, isCompactViewport]
  );

  const handleShellPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCompactViewport || event.pointerType !== 'touch') {
        return;
      }
      updateMobileTouchInteraction({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        preventDefault: () => event.preventDefault()
      });
    },
    [isCompactViewport, updateMobileTouchInteraction]
  );

  const handleShellPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isCompactViewport || event.pointerType !== 'touch') {
        return;
      }
      endMobileTouchInteraction(event.pointerId);
    },
    [endMobileTouchInteraction, isCompactViewport]
  );

  const handleShellTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isCompactViewport || mobileTouchTransportRef.current === 'pointer') {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      mobileTouchTransportRef.current = 'touch';
      beginMobileTouchInteraction({
        pointerId: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        target: event.target instanceof Element ? event.target : null
      });
    },
    [beginMobileTouchInteraction, isCompactViewport]
  );

  const handleShellTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isCompactViewport || mobileTouchTransportRef.current === 'pointer') {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      updateMobileTouchInteraction({
        pointerId: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        preventDefault: () => event.preventDefault()
      });
    },
    [isCompactViewport, updateMobileTouchInteraction]
  );

  const handleShellTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isCompactViewport || mobileTouchTransportRef.current === 'pointer') {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      endMobileTouchInteraction(touch.identifier);
    },
    [endMobileTouchInteraction, isCompactViewport]
  );

  const handleShellClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressTouchClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

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

  const visibleWindows = orderedWindows.filter((windowItem) => {
    if (windowItem.minimized) {
      return false;
    }
    if (!isCompactViewport) {
      return true;
    }
    return mobileSurface === 'app' && windowItem.windowId === mobileVisibleWindowId;
  });

  const mobileCanGoBack =
    Boolean(contextMenu || promptDialog || revisionDialog || llmOutputDialog) ||
    mobileSurface !== 'home';

  return (
    <div
      className={`desktop-shell${isCompactViewport ? ' desktop-shell--mobile' : ''}`}
      data-mobile-mode={isCompactViewport ? 'true' : 'false'}
      data-mobile-surface={isCompactViewport ? mobileSurface : 'desktop'}
      onContextMenu={onContextMenu}
      onPointerDown={handleShellPointerDown}
      onPointerMove={handleShellPointerMove}
      onPointerUp={handleShellPointerEnd}
      onPointerCancel={handleShellPointerEnd}
      onTouchStart={handleShellTouchStart}
      onTouchMove={handleShellTouchMove}
      onTouchEnd={handleShellTouchEnd}
      onTouchCancel={handleShellTouchEnd}
      onClickCapture={handleShellClickCapture}
    >
      {isCompactViewport ? <MobileStatusBar surface={mobileSurface} /> : null}
      <div className="desktop-shell__workspace">
        <DesktopWallpaper wallpaper={state.wallpaper} />
        {isCompactViewport && mobileSurface !== 'app' ? (
          <div className="desktop-shell__mobile-backdrop" aria-hidden="true" />
        ) : null}
        {(!isCompactViewport || mobileSurface !== 'app') && (
          <div className="desktop-shell__items">
            <DesktopIcons
              apps={desktopApps}
              onOpenApp={openApp}
              interactionMode={isCompactViewport ? 'mobile' : 'desktop'}
            />
          </div>
        )}
        <section ref={windowCanvasRef} className="window-canvas">
          {visibleWindows.map((windowItem) => {
            const definition = resolveAppDefinition(windowItem.appId);
            return (
              <WindowFrame
                key={windowItem.windowId}
                windowItem={windowItem}
                windowIcon={getWindowIcon(windowItem)}
                showRevision={definition?.kind !== 'system'}
                focused={windowItem.windowId === state.focusedWindowId}
                mobileMode={isCompactViewport}
                onFocus={() => dispatch({ type: 'window-focus', windowId: windowItem.windowId })}
                onRequestHistory={
                  definition?.kind === 'system'
                    ? undefined
                    : () =>
                        setRevisionDialog({
                          windowId: windowItem.windowId,
                          title: windowItem.title
                        })
                }
                onRequestLlmOutput={
                  definition?.kind === 'system'
                    ? undefined
                    : () =>
                        setLlmOutputDialog({
                          windowId: windowItem.windowId,
                          title: windowItem.title
                        })
                }
                onRequestUpdate={
                  definition?.kind === 'system'
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
                onClose={() => closeDesktopWindow(windowItem.windowId)}
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
        {isCompactViewport && mobileSurface === 'recents' ? (
          <MobileTaskSwitcher
            windows={orderedWindowsByRecency}
            activeWindowId={mobileVisibleWindowId}
            getWindowIcon={(windowItem) =>
              windowItem.generationSelection?.emoji ??
              resolveAppDefinition(windowItem.appId)?.icon ??
              '🧩'
            }
            onSelectWindow={(windowId) => focusWindow(windowId)}
            onCloseWindow={(windowId) => closeDesktopWindow(windowId)}
          />
        ) : null}
        {isCompactViewport && mobileSurface === 'home' ? (
          <button
            type="button"
            className="mobile-home-action"
            data-mobile-home-action
            aria-label="Create new"
            onClick={() => openTaskbarCreateDialog()}
          >
            <span className="mobile-home-action__plus" aria-hidden="true">
              +
            </span>
            <span>Create</span>
          </button>
        ) : null}
      </div>
      {isCompactViewport ? (
        <MobileSystemNav
          surface={mobileSurface}
          canGoBack={mobileCanGoBack}
          hasTasks={state.windows.length > 0}
          onBack={handleMobileBack}
          onHome={handleMobileHome}
          onRecents={handleMobileRecents}
        />
      ) : (
        <Taskbar
          windows={orderedWindows}
          focusedWindowId={state.focusedWindowId}
          getWindowIcon={getWindowIcon}
          onStartClick={openTaskbarCreateDialog}
          onWindowClick={(windowId) => focusWindow(windowId)}
        />
      )}
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
          llmOutputDialog?.windowId ? state.llmOutputs[llmOutputDialog.windowId] ?? '' : ''
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
