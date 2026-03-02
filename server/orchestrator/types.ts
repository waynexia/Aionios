export type WindowLifecycleStatus = 'loading' | 'ready' | 'error';

export type UpdateStrategy = 'hmr' | 'remount';

export type ContextRole = 'system' | 'user' | 'assistant';

export interface ContextEntry {
  role: ContextRole;
  content: string;
  createdAt: string;
}

export interface WindowRevision {
  revision: number;
  source: string;
  prompt: string;
  strategy: UpdateStrategy;
  generatedAt: string;
  backend: string;
}

export interface WindowRecord {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  status: WindowLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  revisions: WindowRevision[];
  context: ContextEntry[];
}

export interface SessionRecord {
  sessionId: string;
  createdAt: string;
  windows: Map<string, WindowRecord>;
}

export interface OpenWindowInput {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  instruction?: string;
}

export interface WindowActionInput {
  sessionId: string;
  windowId: string;
  instruction: string;
}

export interface GenerateRequest {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  reason: 'initial' | 'action';
  instruction?: string;
  promptOverride?: string;
  context: ContextEntry[];
  previousSource?: string;
}

export interface GenerateResult {
  source: string;
  backend: string;
}

export interface LlmProvider {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export interface WindowEvent {
  type: 'window-status' | 'window-ready' | 'window-updated' | 'window-error' | 'window-remount';
  sessionId: string;
  windowId: string;
  title?: string;
  appId?: string;
  status?: WindowLifecycleStatus;
  revision?: number;
  strategy?: UpdateStrategy;
  error?: string;
}

export interface TerminalStatusEvent {
  type: 'terminal-status';
  sessionId: string;
  windowId: string;
  status: 'starting' | 'running' | 'closed' | 'error';
  shell?: string;
  cwd?: string;
  message?: string;
}

export interface TerminalOutputEvent {
  type: 'terminal-output';
  sessionId: string;
  windowId: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface TerminalExitEvent {
  type: 'terminal-exit';
  sessionId: string;
  windowId: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

export type SessionEvent =
  | WindowEvent
  | TerminalStatusEvent
  | TerminalOutputEvent
  | TerminalExitEvent;

export interface WindowSnapshot {
  sessionId: string;
  windowId: string;
  appId: string;
  title: string;
  status: WindowLifecycleStatus;
  revision: number;
  error?: string;
}

export interface SourceSnapshot {
  revision: number;
  source: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export interface ModuleUpdateBridge {
  pushWindowUpdate(
    sessionId: string,
    windowId: string,
    strategy: UpdateStrategy
  ): Promise<{ strategy: UpdateStrategy }>;
}
