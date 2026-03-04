import { useCallback } from 'react';
import {
  branchWindowRevision,
  createPersistedApp,
  listHostFiles,
  openWindow,
  readHostFile,
  requestWindowUpdate,
  trashHostFile,
  writeHostFile
} from '../api/client';
import type { AppAction, CanvasDimensions } from '../state/app-state';
import { windowErrorEvent, windowLifecycleEventFromSnapshot } from '../state/window-events';
import type { AppDefinition, PersistedAppDescriptor } from '../types';
import { dispatchFsChanged } from '../aionios-events';
import {
  buildFileOpenWindowTitle,
  isAppDescriptorPath,
  isMediaFilePath,
  parseAioniosAppDescriptor
} from '../open-file';

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

function stripControlCharacters(input: string) {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) {
      continue;
    }
    result += char;
  }
  return result;
}

function fallbackBaseNameForExtension(extension: string) {
  if (extension === '.svg') {
    return 'New Image';
  }
  if (extension === '.md') {
    return 'New Document';
  }
  if (extension === '.txt') {
    return 'New Text';
  }
  if (extension === '.json') {
    return 'data';
  }
  if (extension === '.html') {
    return 'index';
  }
  return 'New File';
}

function deriveFileBaseNameFromInstruction(instruction: string, extension: string) {
  const fallback = fallbackBaseNameForExtension(extension);
  const trimmed = instruction.trim();
  if (!trimmed) {
    return fallback;
  }
  const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  const replacedSlashes = collapsed.replaceAll('/', '-').replaceAll('\\', '-');
  const withoutControl = stripControlCharacters(replacedSlashes);
  const withoutReserved = withoutControl.replace(/[<>:"|?*]/g, '-');
  const maxLength = 42;
  const bounded = withoutReserved.length > maxLength ? withoutReserved.slice(0, maxLength).trim() : withoutReserved;
  return bounded.length > 0 ? bounded : fallback;
}

function normalizeCreateNewExtension(extension: string) {
  const trimmed = extension.trim();
  if (!trimmed) {
    return '.app';
  }
  const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  return withDot.toLowerCase();
}

function inferCreateNewExtension(instruction: string) {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) {
    return '.app';
  }

  if (normalized.includes('.svg') || /\bsvg\b/u.test(normalized) || normalized.includes('vector icon')) {
    return '.svg';
  }
  if (normalized.includes('slides') || normalized.includes('presentation') || normalized.includes('slide deck')) {
    return '.md';
  }
  if (normalized.includes('.md') || normalized.includes('markdown') || normalized.includes('readme')) {
    return '.md';
  }
  if (normalized.includes('.txt') || /\btext\b/u.test(normalized) || normalized.includes('plain text')) {
    return '.txt';
  }
  if (normalized.includes('.json') || /\bjson\b/u.test(normalized)) {
    return '.json';
  }
  if (normalized.includes('.html') || /\bhtml\b/u.test(normalized) || normalized.includes('web page')) {
    return '.html';
  }
  if (normalized.includes('.css') || /\bcss\b/u.test(normalized)) {
    return '.css';
  }
  if (normalized.includes('.csv') || /\bcsv\b/u.test(normalized)) {
    return '.csv';
  }

  if (
    normalized.includes('.app') ||
    /\bapp\b/u.test(normalized) ||
    normalized.includes('application') ||
    normalized.includes('dashboard') ||
    normalized.includes('tool')
  ) {
    return '.app';
  }

  return '.app';
}

function normalizeCreateNewDirectory(directory: string) {
  const trimmed = directory.replaceAll('\\', '/').trim();
  if (!trimmed) {
    return '';
  }
  const withoutPrefix = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  const withoutLeadingSlash = withoutPrefix.replace(/^\/+/, '');
  const collapsed = withoutLeadingSlash.replace(/\/+/g, '/').trim();
  return collapsed.replace(/\/+$/g, '');
}

function pickUniqueVirtualPath(input: {
  existingPaths: Set<string>;
  directory: string;
  baseName: string;
  extension: string;
}) {
  const directory = normalizeCreateNewDirectory(input.directory);
  const prefix = directory.length > 0 ? `${directory}/` : '';
  const extension = normalizeCreateNewExtension(input.extension);
  const baseName = input.baseName.trim().length > 0 ? input.baseName.trim() : fallbackBaseNameForExtension(extension);

  const candidate = `${prefix}${baseName}${extension}`;
  if (!input.existingPaths.has(candidate)) {
    return candidate;
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const attempt = `${prefix}${baseName}-${String(suffix)}${extension}`;
    if (!input.existingPaths.has(attempt)) {
      return attempt;
    }
  }

  throw new Error('Unable to pick a unique file name.');
}

function buildCreateNewFileContent(input: { instruction: string; extension: string; title: string }) {
  const extension = normalizeCreateNewExtension(input.extension);
  const normalizedInstruction = input.instruction.trim();
  const title = input.title.trim().length > 0 ? input.title.trim() : 'Untitled';

  if (extension === '.svg') {
    const safeComment = normalizedInstruction.replaceAll('--', '—').slice(0, 240);
    return [
      `<!-- ${title} -->`,
      safeComment ? `<!-- ${safeComment} -->` : null,
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="' +
        title.replaceAll('"', "'") +
        '">',
      '  <defs>',
      '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
      '      <stop offset="0" stop-color="#0f172a" />',
      '      <stop offset="1" stop-color="#1e293b" />',
      '    </linearGradient>',
      '  </defs>',
      '  <rect width="512" height="512" rx="96" fill="url(#bg)" />',
      '  <circle cx="256" cy="256" r="156" fill="#2563eb" opacity="0.95" />',
      '  <circle cx="208" cy="220" r="22" fill="#f8fafc" opacity="0.9" />',
      '  <circle cx="306" cy="282" r="14" fill="#f8fafc" opacity="0.85" />',
      '  <path d="M160 340c44 44 148 44 192 0" fill="none" stroke="#bfdbfe" stroke-width="18" stroke-linecap="round" />',
      '</svg>',
      ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (extension === '.md') {
    return [
      `# ${title}`,
      '',
      normalizedInstruction ? normalizedInstruction : 'Created by Aionios Create New.',
      ''
    ].join('\n');
  }

  if (extension === '.json') {
    return `${JSON.stringify(
      {
        title,
        description: normalizedInstruction || 'Created by Aionios Create New.'
      },
      null,
      2
    )}\n`;
  }

  if (extension === '.html') {
    const safeTitle = title.replaceAll('<', '').replaceAll('>', '');
    return [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      `    <title>${safeTitle}</title>`,
      '  </head>',
      '  <body>',
      `    <h1>${safeTitle}</h1>`,
      normalizedInstruction ? `    <p>${normalizedInstruction.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>` : null,
      '  </body>',
      '</html>',
      ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  return `${normalizedInstruction || 'Created by Aionios Create New.'}\n`;
}

export function useWindowActions(options: {
  sessionId: string | undefined;
  dispatch: (action: AppAction) => void;
  getWindowCanvasDimensions: () => CanvasDimensions | undefined;
  resolveAppDefinition: (appId: string) => AppDefinition | undefined;
  refreshPersistedApps: () => Promise<void>;
  upsertPersistedApp: (descriptor: PersistedAppDescriptor) => void;
}) {
  const {
    dispatch,
    getWindowCanvasDimensions,
    refreshPersistedApps,
    resolveAppDefinition,
    sessionId,
    upsertPersistedApp
  } = options;

  const openSystemWindow = useCallback(
    async (input: { appId: string; title: string; windowId?: string; launch?: { kind: 'open-file'; path: string } }) => {
      if (!sessionId) {
        return;
      }
      const windowId = input.windowId ?? randomWindowId();
      const canvas = getWindowCanvasDimensions();
      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId: input.appId,
          title: input.title
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
          launch: input.launch,
          canvas
        });
      } catch (error) {
        dispatch({
          type: 'window-open-local',
          windowId,
          sessionId,
          appId: input.appId,
          title: input.title,
          initialStatus: 'error',
          initialError: (error as Error).message,
          launch: input.launch,
          canvas
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, sessionId]
  );

  const requestUpdateForWindow = useCallback(
    async (windowId: string, instruction: string) => {
      if (!sessionId) {
        return;
      }
      await requestWindowUpdate({
        sessionId,
        windowId,
        instruction
      });
    },
    [sessionId]
  );

  const openApp = useCallback(
    async (appId: string, instruction?: string) => {
      if (!sessionId) {
        return;
      }
      const definition = resolveAppDefinition(appId);
      const title = definition?.title ?? `App ${appId}`;
      const windowId = randomWindowId();
      const isSystemApp = definition?.kind === 'system';
      const canvas = getWindowCanvasDimensions();
      const normalizedInstruction = instruction?.trim() ? instruction.trim() : undefined;

      if (isSystemApp) {
        await openSystemWindow({
          windowId,
          appId,
          title
        });
        return;
      }

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId,
        appId,
        title,
        canvas
      });
      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId,
          title,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: windowLifecycleEventFromSnapshot(snapshot, 'remount')
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: windowErrorEvent({
            sessionId,
            windowId,
            error: (error as Error).message
          })
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, openSystemWindow, resolveAppDefinition, sessionId]
  );

  const openFile = useCallback(
    async (virtualPath: string) => {
      if (!sessionId) {
        return;
      }

      const trimmed = virtualPath.replaceAll('\\', '/').trim();
      const withoutPrefix = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
      const normalizedPath = withoutPrefix.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      if (!normalizedPath) {
        return;
      }

      if (isAppDescriptorPath(normalizedPath)) {
        try {
          const content = await readHostFile({ path: normalizedPath });
          const parsed = parseAioniosAppDescriptor(content.content);
          if (parsed) {
            await refreshPersistedApps();
            await openApp(parsed.appId);
            return;
          }
        } catch {
          // fall through to open the descriptor as a plain JSON file
        }
      }

      const targetSystemAppId = isMediaFilePath(normalizedPath) ? 'media' : 'editor';
      const definition = resolveAppDefinition(targetSystemAppId);
      const appTitle = definition?.title ?? targetSystemAppId;
      const title = buildFileOpenWindowTitle({ appTitle, path: normalizedPath });
      await openSystemWindow({
        appId: targetSystemAppId,
        title,
        launch: { kind: 'open-file', path: normalizedPath }
      });
    },
    [openApp, openSystemWindow, refreshPersistedApps, resolveAppDefinition, sessionId]
  );

  const createNewApp = useCallback(
    async (instruction: string, directory: string) => {
      if (!sessionId) {
        return;
      }

      const extension = normalizeCreateNewExtension(inferCreateNewExtension(instruction));
      if (extension !== '.app') {
        const normalizedDirectory = normalizeCreateNewDirectory(directory);
        const directoryForEvent = normalizedDirectory.length > 0 ? normalizedDirectory : '/';
        const title = deriveFileBaseNameFromInstruction(instruction, extension);
        let existingPaths = new Set<string>();
        try {
          const { files } = await listHostFiles();
          existingPaths = new Set(files.map((file) => file.path));
        } catch (error) {
          console.warn('[aionios] unable to list host files for Create New', error);
        }

        let virtualPath: string;
        try {
          virtualPath = pickUniqueVirtualPath({
            existingPaths,
            directory: normalizedDirectory,
            baseName: title,
            extension
          });
        } catch (error) {
          console.warn('[aionios] unable to choose a unique file path for Create New', error);
          return;
        }

        const content = buildCreateNewFileContent({ instruction, extension, title });
        try {
          await writeHostFile({ path: virtualPath, content });
          dispatchFsChanged({ action: 'refresh', path: directoryForEvent });
          await openFile(virtualPath);
        } catch (error) {
          console.warn('[aionios] unable to write Create New file', virtualPath, error);
        }
        return;
      }

      const normalizedInstruction = instruction.trim() ? instruction.trim() : undefined;
      const windowId = randomWindowId();
      const title = deriveWindowTitleFromInstruction(instruction);
      const canvas = getWindowCanvasDimensions();

      let descriptor: PersistedAppDescriptor | null = null;
      try {
        descriptor = await createPersistedApp({
          directory,
          title
        });
        upsertPersistedApp(descriptor);
        await refreshPersistedApps();
      } catch (error) {
        console.warn('[aionios] unable to persist Create New app, falling back to ephemeral window', error);
      }

      const appId = descriptor?.appId ?? 'custom';
      const resolvedTitle = descriptor?.title ?? title;

      dispatch({
        type: 'window-open-local',
        windowId,
        sessionId,
        appId,
        title: resolvedTitle,
        canvas
      });

      try {
        const snapshot = await openWindow({
          sessionId,
          windowId,
          appId,
          title: resolvedTitle,
          instruction: normalizedInstruction
        });
        dispatch({
          type: 'window-server-event',
          event: windowLifecycleEventFromSnapshot(snapshot, 'remount')
        });
      } catch (error) {
        dispatch({
          type: 'window-server-event',
          event: windowErrorEvent({
            sessionId,
            windowId,
            error: (error as Error).message
          })
        });
      }
    },
    [dispatch, getWindowCanvasDimensions, openFile, refreshPersistedApps, sessionId, upsertPersistedApp]
  );

  const branchWindowFromRevision = useCallback(
    async (sourceWindowId: string, revision: number) => {
      if (!sessionId) {
        throw new Error('No active session.');
      }
      const newWindowId = randomWindowId();
      const canvas = getWindowCanvasDimensions();
      const snapshot = await branchWindowRevision({
        sessionId,
        windowId: sourceWindowId,
        revision,
        newWindowId
      });
      dispatch({
        type: 'window-open-local',
        windowId: newWindowId,
        sessionId: snapshot.sessionId,
        appId: snapshot.appId,
        title: snapshot.title,
        initialStatus: snapshot.status,
        initialRevision: snapshot.revision,
        initialError: snapshot.error,
        canvas
      });
    },
    [dispatch, getWindowCanvasDimensions, sessionId]
  );

  const trashVirtualPath = useCallback(
    async (virtualPath: string) => {
      const trashed = await trashHostFile({ path: virtualPath });
      dispatchFsChanged({ action: 'trash', path: trashed.originalPath });
      if (isAppDescriptorPath(trashed.originalPath)) {
        await refreshPersistedApps();
      }
    },
    [refreshPersistedApps]
  );

  return {
    openApp,
    openFile,
    createNewApp,
    requestUpdateForWindow,
    branchWindowFromRevision,
    trashVirtualPath
  };
}
