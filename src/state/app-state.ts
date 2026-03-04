import type {
  ClientWindowStatus,
  DesktopWindow,
  ServerWindowEvent,
  TerminalStateSnapshot,
  UpdateStrategy,
  WindowLaunchRequest,
  WindowBounds
} from '../types';

type TerminalServerEvent = Extract<
  ServerWindowEvent,
  { type: 'terminal-status' | 'terminal-output' | 'terminal-exit' }
>;
type LlmServerEvent = Extract<ServerWindowEvent, { type: 'llm-output' }>;
type WindowServerEvent = Exclude<ServerWindowEvent, TerminalServerEvent | LlmServerEvent>;

export interface AppState {
  sessionId?: string;
  bootError?: string;
  windows: DesktopWindow[];
  focusedWindowId?: string;
  nextZIndex: number;
  terminals: Record<string, TerminalStateSnapshot>;
  llmOutputs: Record<string, string>;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

export type AppAction =
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
      launch?: WindowLaunchRequest;
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
      type: 'llm-output-clear';
      windowId: string;
    };

const MAX_TERMINAL_BUFFER_CHARS = 40_000;
const MAX_LLM_OUTPUT_BUFFER_CHARS = 80_000;
const DEFAULT_WINDOW_WIDTH = 760;
const DEFAULT_WINDOW_HEIGHT = 520;
const WINDOW_CASCADE_X = 30;
const WINDOW_CASCADE_Y = 26;
const WINDOW_CASCADE_LIMIT = 6;

export const initialState: AppState = {
  windows: [],
  nextZIndex: 10,
  terminals: {},
  llmOutputs: {}
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
  return windows.map((windowItem) =>
    windowItem.windowId === windowId ? updater(windowItem) : windowItem
  );
}

function normalizeTerminalBuffer(buffer: string) {
  if (buffer.length <= MAX_TERMINAL_BUFFER_CHARS) {
    return buffer;
  }
  return buffer.slice(buffer.length - MAX_TERMINAL_BUFFER_CHARS);
}

function normalizeLlmOutputBuffer(buffer: string) {
  if (buffer.length <= MAX_LLM_OUTPUT_BUFFER_CHARS) {
    return buffer;
  }
  return buffer.slice(buffer.length - MAX_LLM_OUTPUT_BUFFER_CHARS);
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

function createInitialWindowBounds(windows: DesktopWindow[], canvas?: CanvasDimensions): WindowBounds {
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
    (event.type === 'window-error'
      ? 'error'
      : event.type === 'window-status'
        ? 'loading'
        : 'ready');

  return {
    ...state,
    llmOutputs:
      event.type === 'window-status' && status === 'loading'
        ? {
            ...state.llmOutputs,
            [event.windowId]: ''
          }
        : state.llmOutputs,
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

function applyLlmEvent(state: AppState, event: LlmServerEvent): AppState {
  const current = state.llmOutputs[event.windowId] ?? '';
  const next = normalizeLlmOutputBuffer(`${current}${event.chunk ?? ''}`);
  return {
    ...state,
    llmOutputs: {
      ...state.llmOutputs,
      [event.windowId]: next
    }
  };
}

function applyServerEvent(state: AppState, event: ServerWindowEvent): AppState {
  if (
    event.type === 'terminal-status' ||
    event.type === 'terminal-output' ||
    event.type === 'terminal-exit'
  ) {
    return applyTerminalEvent(state, event);
  }
  if (event.type === 'llm-output') {
    return applyLlmEvent(state, event);
  }
  return applyWindowEvent(state, event);
}

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
      const existing = state.windows.find((windowItem) => windowItem.windowId === action.windowId);
      const nextZ = state.nextZIndex + 1;
      if (existing) {
        return {
          ...state,
          focusedWindowId: action.windowId,
          nextZIndex: nextZ,
          windows: updateWindow(state.windows, action.windowId, (windowItem) => ({
            ...windowItem,
            sessionId: action.sessionId,
            appId: action.appId,
            title: action.title,
            launch: action.launch ?? windowItem.launch,
            status: action.initialStatus ?? windowItem.status,
            revision: action.initialRevision ?? windowItem.revision,
            minimized: false,
            zIndex: nextZ,
            error: action.initialError ?? windowItem.error
          }))
        };
      }

      const initialBounds = createInitialWindowBounds(state.windows, action.canvas);
      const nextWindow: DesktopWindow = {
        windowId: action.windowId,
        sessionId: action.sessionId,
        appId: action.appId,
        title: action.title,
        launch: action.launch,
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
        llmOutputs: {
          ...state.llmOutputs,
          [action.windowId]: ''
        },
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
      const nextLlmOutputs = { ...state.llmOutputs };
      delete nextLlmOutputs[action.windowId];
      return {
        ...state,
        windows: state.windows.filter((windowItem) => windowItem.windowId !== action.windowId),
        terminals: nextTerminals,
        llmOutputs: nextLlmOutputs,
        focusedWindowId: state.focusedWindowId === action.windowId ? undefined : state.focusedWindowId
      };
    }
    case 'window-toggle-minimize':
      return {
        ...state,
        focusedWindowId: state.focusedWindowId === action.windowId ? undefined : state.focusedWindowId,
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
    case 'llm-output-clear':
      return {
        ...state,
        llmOutputs: {
          ...state.llmOutputs,
          [action.windowId]: ''
        }
      };
    default:
      return state;
  }
}
