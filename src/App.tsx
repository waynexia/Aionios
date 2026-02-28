import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { openWindow, createSession, requestWindowUpdate } from './api/client';
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
  UpdateStrategy
} from './types';

interface AppState {
  sessionId?: string;
  bootError?: string;
  windows: DesktopWindow[];
  focusedWindowId?: string;
  nextZIndex: number;
  files: Record<string, HostFileEntry>;
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

const initialState: AppState = {
  windows: [],
  nextZIndex: 10,
  files: {}
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

function applyServerEvent(state: AppState, event: ServerWindowEvent): AppState {
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
    windows: updateWindow(state.windows, event.windowId, (windowItem) => ({
      ...windowItem,
      title: event.title ?? windowItem.title,
      status,
      revision: event.revision ?? windowItem.revision,
      strategy,
      error: event.error ?? (status === 'error' ? windowItem.error : undefined),
      minimized: status === 'ready' ? false : windowItem.minimized
    }))
  };
}

function reducer(state: AppState, action: AppAction): AppState {
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
        status: 'loading',
        revision: 0,
        strategy: 'remount',
        mountNonce: 0,
        minimized: false,
        zIndex: nextZ
      };
      return {
        ...state,
        focusedWindowId: action.windowId,
        nextZIndex: nextZ,
        windows: [...state.windows, nextWindow]
      };
    }
    case 'window-focus':
      return maximizeZIndex(state, action.windowId);
    case 'window-close':
      return {
        ...state,
        windows: state.windows.filter((windowItem) => windowItem.windowId !== action.windowId),
        focusedWindowId:
          state.focusedWindowId === action.windowId ? undefined : state.focusedWindowId
      };
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

  useEffect(() => {
    filesRef.current = state.files;
  }, [state.files]);

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
      'window-remount'
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
      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId: state.sessionId,
        appId,
        title
      });
      try {
        await openWindow({
          sessionId: state.sessionId,
          windowId,
          appId,
          title
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

  if (!state.sessionId) {
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
              sessionId: state.sessionId!,
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
              listFiles: async () => Object.values(filesRef.current)
            };

            return (
              <WindowFrame
                key={`${windowItem.windowId}:${windowItem.mountNonce}`}
                windowItem={windowItem}
                focused={windowItem.windowId === state.focusedWindowId}
                onFocus={() => dispatch({ type: 'window-focus', windowId: windowItem.windowId })}
                onMinimize={() =>
                  dispatch({
                    type: 'window-toggle-minimize',
                    windowId: windowItem.windowId
                  })
                }
                onClose={() =>
                  dispatch({
                    type: 'window-close',
                    windowId: windowItem.windowId
                  })
                }
              >
                <WindowRuntime windowItem={windowItem} hostBridge={hostBridge} />
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
