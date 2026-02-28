export type ClientWindowStatus = 'loading' | 'ready' | 'error';

export type UpdateStrategy = 'hmr' | 'remount';

export interface AppDefinition {
  appId: string;
  title: string;
  icon: string;
  hint: string;
}

export interface DesktopWindow {
  windowId: string;
  sessionId: string;
  appId: string;
  title: string;
  status: ClientWindowStatus;
  revision: number;
  strategy: UpdateStrategy;
  mountNonce: number;
  minimized: boolean;
  zIndex: number;
  error?: string;
}

export interface HostFileEntry {
  path: string;
  content: string;
  updatedAt: string;
}

export interface WindowModuleState {
  title: string;
  revision: number;
  status: ClientWindowStatus;
}

export interface HostBridge {
  sessionId: string;
  windowId: string;
  appId: string;
  openApp: (appId: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  requestUpdate: (instruction: string) => Promise<void>;
  listFiles: () => Promise<HostFileEntry[]>;
}

export interface WindowModuleProps {
  host: HostBridge;
  windowState: WindowModuleState;
}

export interface ServerWindowSnapshot {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  status: ClientWindowStatus;
  revision: number;
  error?: string;
}

export type ServerEventType =
  | 'window-status'
  | 'window-ready'
  | 'window-updated'
  | 'window-error'
  | 'window-remount';

export interface ServerWindowEvent {
  type: ServerEventType;
  sessionId: string;
  windowId: string;
  appId?: string;
  title?: string;
  status?: ClientWindowStatus;
  revision?: number;
  strategy?: UpdateStrategy;
  error?: string;
}
