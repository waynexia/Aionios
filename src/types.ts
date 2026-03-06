export type ClientWindowStatus = 'loading' | 'ready' | 'error';

export type UpdateStrategy = 'hmr' | 'remount';

export type LlmBackend = 'mock' | 'codex';

export type ArtifactMetadataKind = 'window' | 'app' | 'file';

export interface GenerationSelection {
  emoji: string;
  fileName: string;
}

export interface ArtifactMetadataSuggestion extends GenerationSelection {
  title: string;
  backend: string;
}

export type WindowLaunchRequest = { kind: 'open-file'; path: string };

export interface PreferenceConfig {
  serverPort: number;
  serverDisableHmr: boolean;
  llmBackend: LlmBackend;
  codexCommand: string;
  codexTimeoutMs: number;
  llmStreamOutput: boolean;
  terminalShell: string;
}

export type PreferenceConfigUpdate = Partial<PreferenceConfig>;

export interface AppDefinition {
  appId: string;
  title: string;
  icon: string;
  hint: string;
  kind: 'system' | 'llm';
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWindow {
  windowId: string;
  sessionId: string;
  appId: string;
  title: string;
  generationSelection?: GenerationSelection;
  launch?: WindowLaunchRequest;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
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

export type WallpaperKind = 'image' | 'video';

export interface WallpaperState {
  kind: WallpaperKind;
  source: string;
}

export interface RecycleBinItem {
  id: string;
  originalPath: string;
  deletedAt: string;
  sizeBytes: number;
}

export interface PersistedAppDescriptor {
  appId: string;
  title: string;
  icon: string;
  path: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
}

export interface WindowModuleState {
  title: string;
  revision: number;
  status: ClientWindowStatus;
  launch?: WindowLaunchRequest;
  terminal?: TerminalStateSnapshot;
}

export interface TerminalStateSnapshot {
  status: 'idle' | 'starting' | 'running' | 'closed' | 'error';
  buffer: string;
  shell?: string;
  cwd?: string;
  message?: string;
}

export interface TerminalHostBridge {
  start: () => Promise<void>;
  sendInput: (input: string) => Promise<void>;
  stop: () => Promise<void>;
}

export interface PreferenceHostBridge {
  read: () => Promise<PreferenceConfig>;
  update: (input: PreferenceConfigUpdate) => Promise<PreferenceConfig>;
}

export interface RecycleBinHostBridge {
  listItems: () => Promise<RecycleBinItem[]>;
  trash: (path: string) => Promise<RecycleBinItem>;
  restore: (id: string) => Promise<{ restoredPath: string }>;
  deleteItem: (id: string) => Promise<void>;
  empty: () => Promise<{ emptied: number }>;
}

export interface HostBridge {
  sessionId: string;
  windowId: string;
  appId: string;
  openApp: (appId: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  requestUpdate: (instruction: string) => Promise<void>;
  listFiles: () => Promise<HostFileEntry[]>;
  setWallpaper: (wallpaper: WallpaperState | null) => Promise<void>;
  preference: PreferenceHostBridge;
  terminal: TerminalHostBridge;
  recycleBin: RecycleBinHostBridge;
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
  generationSelection?: GenerationSelection;
  status: ClientWindowStatus;
  revision: number;
  error?: string;
}

export interface WindowRevisionSummary {
  revision: number;
  generatedAt: string;
  backend: string;
  strategy: UpdateStrategy;
}

export interface WindowRevisionDetail extends WindowRevisionSummary {
  prompt: string;
  source: string;
}

export interface WindowRevisionPromptDetail extends WindowRevisionSummary {
  prompt: string;
}

export type ServerEventType =
  | 'window-status'
  | 'window-ready'
  | 'window-updated'
  | 'window-error'
  | 'window-remount'
  | 'terminal-status'
  | 'terminal-output'
  | 'terminal-exit'
  | 'llm-output';

export interface ServerWindowLifecycleEvent {
  type: 'window-status' | 'window-ready' | 'window-updated' | 'window-error' | 'window-remount';
  sessionId: string;
  windowId: string;
  appId?: string;
  title?: string;
  generationSelection?: GenerationSelection;
  status?: ClientWindowStatus;
  revision?: number;
  strategy?: UpdateStrategy;
  error?: string;
}

export interface ServerTerminalStatusEvent {
  type: 'terminal-status';
  sessionId: string;
  windowId: string;
  status: TerminalStateSnapshot['status'];
  shell?: string;
  cwd?: string;
  message?: string;
}

export interface ServerTerminalOutputEvent {
  type: 'terminal-output';
  sessionId: string;
  windowId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface ServerTerminalExitEvent {
  type: 'terminal-exit';
  sessionId: string;
  windowId: string;
  code: number | null;
  signal: string | null;
}

export interface ServerLlmOutputEvent {
  type: 'llm-output';
  sessionId: string;
  windowId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export type ServerWindowEvent =
  | ServerWindowLifecycleEvent
  | ServerTerminalStatusEvent
  | ServerTerminalOutputEvent
  | ServerTerminalExitEvent
  | ServerLlmOutputEvent;
