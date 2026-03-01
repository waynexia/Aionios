import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
import { DesktopIcons } from './components/DesktopIcons';
import { FilePanel } from './components/FilePanel';
import { Taskbar } from './components/Taskbar';
import { WindowFrame } from './components/WindowFrame';
import { WindowRuntime } from './components/WindowRuntime';
import type {
  ClientWindowStatus,
  DesktopWindow,
  HostBridge,
  HostFileEntry,
  ServerWindowEvent,
  TerminalStateSnapshot,
  UpdateStrategy
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
      type: 'window-server-event';
      event: ServerWindowEvent;
    }
  | {
      type: 'file-write';
      path: string;
      content: string;
    };

const MAX_TERMINAL_BUFFER_CHARS = 40_000;

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
        mountNonce: windowItem.mountNonce + 1
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
      const nextWindow: DesktopWindow = {
        windowId: action.windowId,
        sessionId: action.sessionId,
        appId: action.appId,
        title: action.title,
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

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const filesRef = useRef(state.files);
  const sessionRef = useRef(state.sessionId);

  useEffect(() => {
    filesRef.current = state.files;
    sessionRef.current = state.sessionId;
  }, [state.files, state.sessionId]);

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

  const openApp = useCallback(
    async (appId: string) => {
      if (!state.sessionId) {
        return;
      }
      const definition = getAppDefinition(appId);
      const title = definition?.title ?? `App ${appId}`;
      const windowId = randomWindowId();
      const isSystemApp = definition?.kind === 'system';

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
            initialError: snapshot.error
          });
        } catch (error) {
          dispatch({
            type: 'window-open-local',
            windowId,
            sessionId: state.sessionId,
            appId,
            title,
            initialStatus: 'error',
            initialError: (error as Error).message
          });
        }
        return;
      }

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId: state.sessionId,
        appId,
        title
      });
      try {
        const snapshot = await openWindow({
          sessionId: state.sessionId,
          windowId,
          appId,
          title
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
    [state.sessionId]
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

  const files = useMemo(
    () =>
      Object.values(state.files).sort((left, right) =>
        left.path.localeCompare(right.path, 'en-US')
      ),
    [state.files]
  );

  if (state.bootError) {
    return <div className="booting-shell">Unable to boot desktop: {state.bootError}</div>;
  }

  const activeSessionId = state.sessionId;

  if (!activeSessionId) {
    return <div className="booting-shell">Aionios is booting...</div>;
  }

  return (
    <div className="desktop-shell">
      <div className="desktop-shell__workspace">
        <DesktopIcons apps={APP_CATALOG} onOpenApp={openApp} />
        <section className="window-canvas">
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
        <FilePanel files={files} />
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
    </div>
  );
}
