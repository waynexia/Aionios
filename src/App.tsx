import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  closeWindow,
  createSession,
  getPreferenceConfig,
  openWindow,
  requestWindowUpdate,
  sendTerminalInput,
  startTerminal,
  stopTerminal,
  updatePreferenceConfig
} from './api/client';
import { APP_CATALOG, getAppDefinition } from './app-catalog';
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu';
import { DesktopIcons } from './components/DesktopIcons';
import { Taskbar } from './components/Taskbar';
import { PromptDialog } from './components/PromptDialog';
import { RevisionDialog } from './components/RevisionDialog';
import { WindowFrame } from './components/WindowFrame';
import { WindowRuntime } from './components/WindowRuntime';
import type {
  ClientWindowStatus,
  DesktopWindow,
  HostBridge,
  HostFileEntry,
  ServerWindowEvent,
  TerminalStateSnapshot,
  UpdateStrategy,
  WindowBounds
} from './types';

type TerminalServerEvent = Extract<
  ServerWindowEvent,
  { type: 'terminal-status' | 'terminal-output' | 'terminal-exit' }
>;
type WindowServerEvent = Exclude<ServerWindowEvent, TerminalServerEvent>;

interface AppState {
  sessionId?: string;
  bootError?: string;
  windows: DesktopWindow[];
  focusedWindowId?: string;
  nextZIndex: number;
  files: Record<string, HostFileEntry>;
  terminals: Record<string, TerminalStateSnapshot>;
}

interface CanvasDimensions {
  width: number;
  height: number;
}

type AppAction =
  | {
      type: 'session-ready';
      sessionId: string;
    }
  | {
      type: 'session-error';
      message: string;
    }
  | {
      type: 'window-open-local';
      windowId: string;
      sessionId: string;
      appId: string;
      title: string;
      initialStatus?: ClientWindowStatus;
      initialRevision?: number;
      initialError?: string;
      canvas?: CanvasDimensions;
    }
  | {
      type: 'window-focus';
      windowId: string;
    }
  | {
      type: 'window-close';
      windowId: string;
    }
  | {
      type: 'window-toggle-minimize';
      windowId: string;
    }
  | {
      type: 'window-toggle-maximize';
      windowId: string;
    }
  | {
      type: 'window-set-bounds';
      windowId: string;
      bounds: WindowBounds;
    }
  | {
      type: 'window-server-event';
      event: ServerWindowEvent;
    }
  | {
      type: 'file-write';
      path: string;
      content: string;
    };

const MAX_TERMINAL_BUFFER_CHARS = 40_000;
const DEFAULT_WINDOW_WIDTH = 760;
const DEFAULT_WINDOW_HEIGHT = 520;
const WINDOW_CASCADE_X = 30;
const WINDOW_CASCADE_Y = 26;
const WINDOW_CASCADE_LIMIT = 6;

// eslint-disable-next-line react-refresh/only-export-components
export const initialState: AppState = {
  windows: [],
  nextZIndex: 10,
  files: {},
  terminals: {}
};

function maximizeZIndex(state: AppState, windowId: string): AppState {
  const nextZIndex = state.nextZIndex + 1;
  return {
    ...state,
    nextZIndex,
    focusedWindowId: windowId,
    windows: state.windows.map((windowItem) =>
      windowItem.windowId === windowId
        ? { ...windowItem, minimized: false, zIndex: nextZIndex }
        : windowItem
    )
  };
}

function updateWindow(
  windows: DesktopWindow[],
  windowId: string,
  updater: (windowItem: DesktopWindow) => DesktopWindow
) {
  return windows.map((windowItem) => (windowItem.windowId === windowId ? updater(windowItem) : windowItem));
}

function normalizeTerminalBuffer(buffer: string) {
  if (buffer.length <= MAX_TERMINAL_BUFFER_CHARS) {
    return buffer;
  }
  return buffer.slice(buffer.length - MAX_TERMINAL_BUFFER_CHARS);
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function shouldKeepNativeContextMenu(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, option, [contenteditable], .xterm'));
}

function createInitialWindowBounds(
  windows: DesktopWindow[],
  canvas?: CanvasDimensions
): WindowBounds {
  const cascadeIndex = windows.length % WINDOW_CASCADE_LIMIT;
  const baseX = 18 + cascadeIndex * WINDOW_CASCADE_X;
  const baseY = 18 + cascadeIndex * WINDOW_CASCADE_Y;
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
    return {
      x: baseX,
      y: baseY,
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT
    };
  }

  const boundedWidth = Math.max(1, Math.floor(canvas.width));
  const boundedHeight = Math.max(1, Math.floor(canvas.height));
  const width = clamp(DEFAULT_WINDOW_WIDTH, 1, boundedWidth);
  const height = clamp(DEFAULT_WINDOW_HEIGHT, 1, boundedHeight);
  return {
    x: clamp(baseX, 0, boundedWidth - width),
    y: clamp(baseY, 0, boundedHeight - height),
    width,
    height
  };
}

function applyTerminalEvent(state: AppState, event: TerminalServerEvent): AppState {
  const current: TerminalStateSnapshot = state.terminals[event.windowId] ?? {
    status: 'idle',
    buffer: ''
  };

  if (event.type === 'terminal-output') {
    const nextBuffer = normalizeTerminalBuffer(`${current.buffer}${event.chunk ?? ''}`);
    return {
      ...state,
      terminals: {
        ...state.terminals,
        [event.windowId]: {
          ...current,
          buffer: nextBuffer
        }
      }
    };
  }

  if (event.type === 'terminal-exit') {
    const exitMessage = event.signal
      ? `\n\n[Terminal exited via signal ${event.signal}]`
      : `\n\n[Terminal exited with code ${String(event.code ?? 'unknown')}]`;
    return {
      ...state,
      terminals: {
        ...state.terminals,
        [event.windowId]: {
          ...current,
          status: 'closed',
          buffer: normalizeTerminalBuffer(`${current.buffer}${exitMessage}`)
        }
      }
    };
  }

  return {
    ...state,
    terminals: {
      ...state.terminals,
      [event.windowId]: {
        ...current,
        status: event.status === 'error' ? 'error' : event.status ?? 'running',
        shell: event.shell ?? current.shell,
        cwd: event.cwd ?? current.cwd,
        message: event.message
      }
    }
  };
}

function applyWindowEvent(state: AppState, event: WindowServerEvent): AppState {
  if (event.type === 'window-remount') {
    return {
      ...state,
      windows: updateWindow(state.windows, event.windowId, (windowItem) => ({
        ...windowItem,
        strategy: 'remount',
        mountNonce: windowItem.mountNonce + 1,
        revision: typeof event.revision === 'number' ? event.revision : windowItem.revision
      }))
    };
  }

  const strategy: UpdateStrategy = event.strategy ?? 'hmr';
  const status: ClientWindowStatus =
    event.status ??
    (event.type === 'window-error' ? 'error' : event.type === 'window-status' ? 'loading' : 'ready');

  return {
    ...state,
    windows: updateWindow(state.windows, event.windowId, (windowItem) => {
      if (typeof event.revision === 'number' && event.revision < windowItem.revision) {
        return windowItem;
      }
      const isStaleOpenSnapshot =
        event.type === 'window-status' &&
        status === 'loading' &&
        windowItem.status !== 'loading' &&
        typeof event.revision === 'number' &&
        event.revision === windowItem.revision &&
        event.strategy === 'remount';
      if (isStaleOpenSnapshot) {
        return windowItem;
      }
      return {
        ...windowItem,
        title: event.title ?? windowItem.title,
        status,
        revision: event.revision ?? windowItem.revision,
        strategy,
        error: event.error ?? (status === 'error' ? windowItem.error : undefined),
        minimized: status === 'ready' ? false : windowItem.minimized
      };
    })
  };
}

function applyServerEvent(state: AppState, event: ServerWindowEvent): AppState {
  if (event.type === 'terminal-status' || event.type === 'terminal-output' || event.type === 'terminal-exit') {
    return applyTerminalEvent(state, event);
  }
  return applyWindowEvent(state, event);
}

// eslint-disable-next-line react-refresh/only-export-components
export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'session-ready':
      return {
        ...state,
        sessionId: action.sessionId,
        bootError: undefined
      };
    case 'session-error':
      return {
        ...state,
        bootError: action.message
      };
    case 'window-open-local': {
      const nextZ = state.nextZIndex + 1;
      const initialBounds = createInitialWindowBounds(state.windows, action.canvas);
      const nextWindow: DesktopWindow = {
        windowId: action.windowId,
        sessionId: action.sessionId,
        appId: action.appId,
        title: action.title,
        x: initialBounds.x,
        y: initialBounds.y,
        width: initialBounds.width,
        height: initialBounds.height,
        maximized: false,
        status: action.initialStatus ?? 'loading',
        revision: action.initialRevision ?? 0,
        strategy: 'remount',
        mountNonce: 0,
        minimized: false,
        zIndex: nextZ,
        error: action.initialError
      };
      return {
        ...state,
        focusedWindowId: action.windowId,
        nextZIndex: nextZ,
        windows: [...state.windows, nextWindow],
        terminals:
          action.appId === 'terminal'
            ? {
                ...state.terminals,
                [action.windowId]: {
                  status: 'idle',
                  buffer: ''
                }
              }
            : state.terminals
      };
    }
    case 'window-focus':
      return maximizeZIndex(state, action.windowId);
    case 'window-close': {
      const nextTerminals = { ...state.terminals };
      delete nextTerminals[action.windowId];
      return {
        ...state,
        windows: state.windows.filter((windowItem) => windowItem.windowId !== action.windowId),
        terminals: nextTerminals,
        focusedWindowId:
          state.focusedWindowId === action.windowId ? undefined : state.focusedWindowId
      };
    }
    case 'window-toggle-minimize':
      return {
        ...state,
        focusedWindowId:
          state.focusedWindowId === action.windowId ? undefined : state.focusedWindowId,
        windows: updateWindow(state.windows, action.windowId, (windowItem) => ({
          ...windowItem,
          minimized: !windowItem.minimized
        }))
      };
    case 'window-toggle-maximize': {
      const nextZ = state.nextZIndex + 1;
      return {
        ...state,
        nextZIndex: nextZ,
        focusedWindowId: action.windowId,
        windows: updateWindow(state.windows, action.windowId, (windowItem) => ({
          ...windowItem,
          maximized: !windowItem.maximized,
          minimized: false,
          zIndex: nextZ
        }))
      };
    }
    case 'window-set-bounds':
      return {
        ...state,
        windows: updateWindow(state.windows, action.windowId, (windowItem) =>
          windowItem.maximized
            ? windowItem
            : {
                ...windowItem,
                x: action.bounds.x,
                y: action.bounds.y,
                width: action.bounds.width,
                height: action.bounds.height
              }
        )
      };
    case 'window-server-event':
      return applyServerEvent(state, action.event);
    case 'file-write': {
      return {
        ...state,
        files: {
          ...state.files,
          [action.path]: {
            path: action.path,
            content: action.content,
            updatedAt: new Date().toISOString()
          }
        }
      };
    }
    default:
      return state;
  }
}

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

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const filesRef = useRef(state.files);
  const sessionRef = useRef(state.sessionId);
  const windowCanvasRef = useRef<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<
    | { kind: 'desktop'; x: number; y: number }
    | { kind: 'icon'; x: number; y: number; appId: string }
    | null
  >(null);
  const [promptDialog, setPromptDialog] = useState<
    | { mode: 'update'; windowId: string; title: string }
    | { mode: 'open'; appId: string; title: string; hint: string }
    | { mode: 'create' }
    | null
  >(null);
  const [revisionDialog, setRevisionDialog] = useState<
    | { windowId: string; title: string }
    | null
  >(null);

  useEffect(() => {
    filesRef.current = state.files;
    sessionRef.current = state.sessionId;
  }, [state.files, state.sessionId]);

  useEffect(() => {
    if (!revisionDialog) {
      return;
    }
    if (state.windows.some((windowItem) => windowItem.windowId === revisionDialog.windowId)) {
      return;
    }
    setRevisionDialog(null);
  }, [revisionDialog, state.windows]);

  useEffect(() => {
    let active = true;
    void createSession()
      .then(({ sessionId }) => {
        if (!active) {
          return;
        }
        dispatch({ type: 'session-ready', sessionId });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        dispatch({
          type: 'session-error',
          message: (error as Error).message
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state.sessionId) {
      return;
    }
    const events = new EventSource(`/api/sessions/${state.sessionId}/events`);
    const listener = (rawEvent: MessageEvent<string>) => {
      const event = JSON.parse(rawEvent.data) as ServerWindowEvent;
      dispatch({
        type: 'window-server-event',
        event
      });
    };

    const eventTypes: ServerWindowEvent['type'][] = [
      'window-status',
      'window-ready',
      'window-updated',
      'window-error',
      'window-remount',
      'terminal-status',
      'terminal-output',
      'terminal-exit'
    ];
    for (const type of eventTypes) {
      events.addEventListener(type, listener as EventListener);
    }
    events.onerror = () => {
      console.warn('[aionios] event stream disconnected');
    };

    return () => {
      for (const type of eventTypes) {
        events.removeEventListener(type, listener as EventListener);
      }
      events.close();
    };
  }, [state.sessionId]);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }
    const handler = (payload: { sessionId: string; windowId: string }) => {
      if (payload.sessionId !== state.sessionId) {
        return;
      }
      dispatch({
        type: 'window-server-event',
        event: {
          type: 'window-remount',
          sessionId: payload.sessionId,
          windowId: payload.windowId
        }
      });
    };
    import.meta.hot.on('aionios:window-remount', handler);
    return () => {
      import.meta.hot?.off('aionios:window-remount', handler);
    };
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

  const openApp = useCallback(
    async (appId: string, instruction?: string) => {
      if (!state.sessionId) {
        return;
      }
      const definition = getAppDefinition(appId);
      const title = definition?.title ?? `App ${appId}`;
      const windowId = randomWindowId();
      const isSystemApp = definition?.kind === 'system';
      const canvas = getWindowCanvasDimensions();
      const normalizedInstruction = instruction?.trim() ? instruction.trim() : undefined;

      if (isSystemApp) {
        try {
          const snapshot = await openWindow({
            sessionId: state.sessionId,
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
            sessionId: state.sessionId,
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
        sessionId: state.sessionId,
        appId,
        title,
        canvas
      });
      try {
        const snapshot = await openWindow({
          sessionId: state.sessionId,
          windowId,
          appId,
          title,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: {
            type:
              snapshot.status === 'ready'
                ? 'window-ready'
                : snapshot.status === 'error'
                  ? 'window-error'
                  : 'window-status',
            sessionId: snapshot.sessionId,
            windowId: snapshot.windowId,
            appId: snapshot.appId,
            title: snapshot.title,
            status: snapshot.status,
            revision: snapshot.revision,
            strategy: 'remount',
            error: snapshot.error
          }
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: {
            type: 'window-error',
            sessionId: state.sessionId,
            windowId,
            error: (error as Error).message
          }
        });
      }
    },
    [getWindowCanvasDimensions, state.sessionId]
  );

  const createNewWindow = useCallback(
    async (instruction: string) => {
      if (!state.sessionId) {
        return;
      }

      const windowId = randomWindowId();
      const appId = 'custom';
      const title = deriveWindowTitleFromInstruction(instruction);
      const canvas = getWindowCanvasDimensions();
      const normalizedInstruction = instruction.trim() ? instruction.trim() : undefined;

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId: state.sessionId,
        appId,
        title,
        canvas
      });

      try {
        const snapshot = await openWindow({
          sessionId: state.sessionId,
          windowId,
          appId,
          title,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: {
            type:
              snapshot.status === 'ready'
                ? 'window-ready'
                : snapshot.status === 'error'
                  ? 'window-error'
                  : 'window-status',
            sessionId: snapshot.sessionId,
            windowId: snapshot.windowId,
            appId: snapshot.appId,
            title: snapshot.title,
            status: snapshot.status,
            revision: snapshot.revision,
            strategy: 'remount',
            error: snapshot.error
          }
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: {
            type: 'window-error',
            sessionId: state.sessionId,
            windowId,
            error: (error as Error).message
          }
        });
      }
    },
    [getWindowCanvasDimensions, state.sessionId]
  );

  const requestUpdateForWindow = useCallback(
    async (windowId: string, instruction: string) => {
      if (!state.sessionId) {
        return;
      }
      await requestWindowUpdate({
        sessionId: state.sessionId,
        windowId,
        instruction
      });
    },
    [state.sessionId]
  );

  const orderedWindows = useMemo(
    () => [...state.windows].sort((left, right) => left.zIndex - right.zIndex),
    [state.windows]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const contextMenuItems = useMemo(
    () => {
      if (!contextMenu || contextMenu.kind === 'desktop') {
        return [
          { id: 'refresh', label: 'Refresh' },
          {
            id: 'create',
            label: 'Create New',
            onSelect: () => {
              setPromptDialog({ mode: 'create' });
            }
          },
          { id: 'delete', label: 'Delete', disabled: true }
        ];
      }

      const definition = getAppDefinition(contextMenu.appId);
      const items: ContextMenuItem[] = [
        {
          id: 'open',
          label: `Open ${definition?.title ?? contextMenu.appId}`,
          onSelect: () => {
            void openApp(contextMenu.appId);
          }
        }
      ];

      if (definition?.kind === 'llm') {
        items.push({
          id: 'open-with-prompt',
          label: 'Open with prompt…',
          onSelect: () => {
            setPromptDialog({
              mode: 'open',
              appId: contextMenu.appId,
              title: definition.title,
              hint: definition.hint
            });
          }
        });
      }

      items.push({ id: 'delete', label: 'Delete', disabled: true });
      return items;
    },
    [contextMenu, openApp]
  );

  if (state.bootError) {
    return <div className="booting-shell">Unable to boot desktop: {state.bootError}</div>;
  }

  const activeSessionId = state.sessionId;

  if (!activeSessionId) {
    return <div className="booting-shell">Aionios is booting...</div>;
  }

  return (
    <div
      className="desktop-shell"
      onContextMenu={(event) => {
        if (event.shiftKey || shouldKeepNativeContextMenu(event.target)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const icon = event.target instanceof Element ? event.target.closest('.desktop-icon[data-app-id]') : null;
        if (icon instanceof HTMLElement) {
          const appId = icon.getAttribute('data-app-id');
          if (appId) {
            setContextMenu({ kind: 'icon', x: event.clientX, y: event.clientY, appId });
            return;
          }
        }
        setContextMenu({ kind: 'desktop', x: event.clientX, y: event.clientY });
      }}
    >
      <div className="desktop-shell__workspace">
        <div className="desktop-shell__items">
          <DesktopIcons apps={APP_CATALOG} onOpenApp={openApp} />
        </div>
        <section ref={windowCanvasRef} className="window-canvas">
          {orderedWindows.map((windowItem) => {
            if (windowItem.minimized) {
              return null;
            }

            const hostBridge: HostBridge = {
              sessionId: activeSessionId,
              windowId: windowItem.windowId,
              appId: windowItem.appId,
              openApp: async (appId) => {
                await openApp(appId);
              },
              readFile: async (path) => filesRef.current[path]?.content ?? '',
              writeFile: async (path, content) => {
                dispatch({
                  type: 'file-write',
                  path,
                  content
                });
              },
              requestUpdate: async (instruction) => {
                await requestUpdateForWindow(windowItem.windowId, instruction);
              },
              listFiles: async () => Object.values(filesRef.current),
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
              }
            };

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
                onRequestUpdate={
                  getAppDefinition(windowItem.appId)?.kind === 'system'
                    ? undefined
                    : () =>
                        setPromptDialog({
                          mode: 'update',
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
                <WindowRuntime
                  windowItem={windowItem}
                  hostBridge={hostBridge}
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
      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />
      <PromptDialog
        open={Boolean(promptDialog)}
        title={
          promptDialog?.mode === 'create'
            ? 'Create New'
            : promptDialog?.mode === 'open'
              ? `Open “${promptDialog.title}” with a prompt`
              : promptDialog
                ? `Ask LLM to update “${promptDialog.title}”`
                : 'Ask LLM'
        }
        description={
          promptDialog?.mode === 'create' || promptDialog?.mode === 'open'
            ? 'Describe what you want this new window to be.'
            : 'Describe what you want to change in this window.'
        }
        placeholder={
          promptDialog?.mode === 'open'
            ? promptDialog.hint
            : promptDialog?.mode === 'create'
              ? 'E.g. A kanban board with drag-and-drop, keyboard shortcuts, and saved state.'
              : 'E.g. Add a sidebar, improve styling, and add keyboard shortcuts.'
        }
        initialValue={promptDialog?.mode === 'open' ? promptDialog.hint : ''}
        confirmLabel={
          promptDialog?.mode === 'create'
            ? 'Create'
            : promptDialog?.mode === 'open'
              ? 'Open'
              : 'Update'
        }
        cancelLabel="Cancel"
        onClose={() => setPromptDialog(null)}
        onConfirm={(instruction) => {
          if (!promptDialog) {
            return;
          }
          if (promptDialog.mode === 'create') {
            void createNewWindow(instruction);
          } else if (promptDialog.mode === 'open') {
            void openApp(promptDialog.appId, instruction);
          } else {
            void requestUpdateForWindow(promptDialog.windowId, instruction);
          }
          setPromptDialog(null);
        }}
      />
      <RevisionDialog
        open={Boolean(revisionDialog)}
        sessionId={activeSessionId}
        windowId={revisionDialog?.windowId ?? ''}
        title={revisionDialog?.title ?? ''}
        currentRevision={
          revisionDialog
            ? state.windows.find((windowItem) => windowItem.windowId === revisionDialog.windowId)?.revision ??
              0
            : 0
        }
        onClose={() => setRevisionDialog(null)}
      />
    </div>
  );
}
