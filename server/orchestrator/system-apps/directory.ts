export const DIRECTORY_WINDOW_SOURCE = `
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type FileEntry = {
  path: string;
  content?: string;
  updatedAt?: string;
};

type DirectoryGroup = {
  directory: string;
  files: FileEntry[];
};

type WindowProps = {
  host: {
    windowId: string;
    openApp: (appId: string) => Promise<void>;
    openFile: (path: string) => Promise<void>;
    listFiles: () => Promise<Array<FileEntry | string>>;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  };
  windowState: {
    title: string;
  };
};

function normalizePath(input: string): string {
  const forwardSlashes = input.replaceAll('\\\\', '/').trim();
  const withoutDotPrefix = forwardSlashes.startsWith('./')
    ? forwardSlashes.slice(2)
    : forwardSlashes;
  return withoutDotPrefix.replace(/\\/+/g, '/').replace(/^\\/+/, '');
}

function toPaths(entries: Array<FileEntry | string>): string[] {
  const paths = new Set<string>();
  for (const entry of entries) {
    const candidate = typeof entry === 'string' ? entry : entry.path;
    const normalized = normalizePath(candidate);
    if (!normalized) {
      continue;
    }
    paths.add(normalized);
  }
  return [...paths].sort((left, right) => left.localeCompare(right, 'en-US'));
}

function toFiles(entries: Array<FileEntry | string>): FileEntry[] {
  const files: FileEntry[] = [];
  for (const entry of entries) {
    const candidate = typeof entry === 'string' ? entry : entry.path;
    const normalized = normalizePath(candidate);
    if (!normalized) {
      continue;
    }
    if (typeof entry === 'string') {
      files.push({ path: normalized });
    } else {
      files.push({
        path: normalized,
        content: entry.content,
        updatedAt: entry.updatedAt
      });
    }
  }

  const byPath = new Map<string, FileEntry>();
  for (const file of files) {
    if (!byPath.has(file.path)) {
      byPath.set(file.path, file);
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
}

function toDirectoryGroups(files: FileEntry[]): DirectoryGroup[] {
  const grouped = new Map<string, FileEntry[]>();
  for (const file of files) {
    const splitIndex = file.path.lastIndexOf('/');
    const directory = splitIndex === -1 ? '/' : file.path.slice(0, splitIndex);
    const entries = grouped.get(directory);
    if (entries) {
      entries.push(file);
    } else {
      grouped.set(directory, [file]);
    }
  }
  return [...grouped.entries()]
    .map(([directory, entries]) => ({
      directory,
      files: [...entries].sort((left, right) => left.path.localeCompare(right.path, 'en-US'))
    }))
    .sort((left, right) => {
      if (left.directory === '/') {
        return -1;
      }
      if (right.directory === '/') {
        return 1;
      }
      return left.directory.localeCompare(right.directory, 'en-US');
    });
}

function fileNameFromPath(path: string) {
  const normalized = normalizePath(path);
  const splitIndex = normalized.lastIndexOf('/');
  return splitIndex === -1 ? normalized : normalized.slice(splitIndex + 1);
}

function resolveFileIcon(path: string) {
  const name = fileNameFromPath(path).toLowerCase();
  if (!name) {
    return '📄';
  }
  if (name.endsWith('.app') || name.endsWith('.aionios-app.json')) {
    return '🧩';
  }
  if (name.endsWith('.md')) {
    return '📝';
  }
  if (name.endsWith('.toml')) {
    return '⚙️';
  }
  if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
    return '💻';
  }
  if (name.endsWith('.json')) {
    return '🧾';
  }
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif')) {
    return '🖼️';
  }
  if (name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm')) {
    return '🎬';
  }
  if (name.endsWith('.mp3') || name.endsWith('.wav')) {
    return '🎵';
  }
  return '📄';
}

function parseAppDescriptor(content: string): { appId: string; title: string; icon: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (parsed.kind !== 'aionios.app' || parsed.version !== 1) {
      return null;
    }
    if (typeof parsed.appId !== 'string' || parsed.appId.trim().length === 0) {
      return null;
    }
    if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
      return null;
    }
    const icon = typeof parsed.icon === 'string' && parsed.icon.trim().length > 0 ? parsed.icon.trim() : '🧩';
    return { appId: parsed.appId.trim(), title: parsed.title.trim(), icon };
  } catch {
    return null;
  }
}

export default function WindowApp({ host, windowState }: WindowProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Loading files...');
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const loadFileList = useCallback(
    async (canCommit: () => boolean = () => true) => {
      if (!canCommit()) {
        return;
      }
      setLoadingList(true);
      setStatusMessage('Loading files...');
      setError(null);
      try {
        const entries = await host.listFiles();
        if (!canCommit()) {
          return;
        }
        const nextFiles = toFiles(entries);
        setFiles(nextFiles);
        const nextPaths = nextFiles.map((entry) => entry.path);
        setSelectedPath((current) => {
          if (current && nextPaths.includes(current)) {
            return current;
          }
          return null;
        });
        setStatusMessage(
          nextPaths.length === 0
            ? 'No files found. Right-click a directory to create a file.'
            : 'Loaded ' + nextPaths.length + ' file(s).'
        );
      } catch (reason) {
        if (!canCommit()) {
          return;
        }
        setError((reason as Error).message);
        setStatusMessage('Failed to load files.');
      } finally {
        if (canCommit()) {
          setLoadingList(false);
        }
      }
    },
    [host]
  );

  useEffect(() => {
    let active = true;
    void loadFileList(() => active);
    return () => {
      active = false;
    };
  }, [loadFileList]);

  useEffect(() => {
    const handler = () => {
      void loadFileList();
    };
    window.addEventListener('aionios:fs-changed', handler);
    return () => {
      window.removeEventListener('aionios:fs-changed', handler);
    };
  }, [loadFileList]);

  useEffect(() => {
    if (!selectedPath) {
      return;
    }
    let active = true;
    setLoadingFile(true);
    setStatusMessage('Loading ' + selectedPath + '...');
    setError(null);
    void host.readFile(selectedPath)
      .then((content) => {
        if (!active) {
          return;
        }
        setDraftPath(selectedPath);
        setDraftContent(content);
        setSavedContent(content);
        setStatusMessage('Loaded ' + selectedPath + '.');
        setLoadingFile(false);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setError((reason as Error).message);
        setStatusMessage('Failed to load selected file.');
        setSavedContent('');
        setLoadingFile(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPath]);

  const groups = useMemo(() => toDirectoryGroups(files), [files]);
  const selectedLabel = selectedPath ?? '(new file)';
  const canSave = !saving && !loadingList && draftPath.trim().length > 0;
  const hasUnsavedChanges = useMemo(() => draftContent !== savedContent, [draftContent, savedContent]);
  const isCompactLayout = viewport.width > 0 && viewport.width < 860;
  const isShortLayout = viewport.height > 0 && viewport.height < 520;

  const createNewFileDraft = useCallback((directory?: string) => {
    if (hasUnsavedChanges && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    const normalizedDir = typeof directory === 'string' ? normalizePath(directory) : '';
    const prefix = normalizedDir.length > 0 ? normalizedDir.replace(/\\/+$/g, '') + '/' : '';
    setSelectedPath(null);
    setError(null);
    setDraftPath(prefix + 'new-file.txt');
    setDraftContent('');
    setSavedContent('');
    setStatusMessage('Creating a new file draft.');
  }, [hasUnsavedChanges]);

  const selectPath = useCallback(
    (path: string) => {
      if (path === selectedPath) {
        return;
      }
      if (hasUnsavedChanges && !window.confirm('Discard unsaved changes?')) {
        return;
      }
      setSelectedPath(path);
    },
    [hasUnsavedChanges, selectedPath]
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { windowId?: unknown; directory?: unknown } | undefined)
          : undefined;
      if (!detail || detail.windowId !== host.windowId) {
        return;
      }
      const directory = typeof detail.directory === 'string' ? detail.directory : '/';
      createNewFileDraft(directory);
    };
    window.addEventListener('aionios:directory-new-file', handler);
    return () => {
      window.removeEventListener('aionios:directory-new-file', handler);
    };
  }, [createNewFileDraft, host.windowId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return;
    }
    const updateViewport = () => {
      setViewport({
        width: root.clientWidth,
        height: root.clientHeight
      });
    };
    updateViewport();
    const observer = new ResizeObserver(() => {
      updateViewport();
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

  async function saveDraft() {
    const normalizedPath = normalizePath(draftPath);
    if (!normalizedPath) {
      setError('Path is required.');
      setStatusMessage('Save failed.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage('Saving ' + normalizedPath + '...');
    try {
      await host.writeFile(normalizedPath, draftContent);
      setSavedContent(draftContent);
      const listed = await host.listFiles();
      const nextFiles = toFiles(listed);
      const existing = nextFiles.some((entry) => entry.path === normalizedPath);
      if (!existing) {
        nextFiles.push({ path: normalizedPath, content: draftContent, updatedAt: new Date().toISOString() });
        nextFiles.sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
      }
      setFiles(nextFiles);
      setSelectedPath(normalizedPath);
      setDraftPath(normalizedPath);
      setStatusMessage('Saved ' + normalizedPath + '.');
    } catch (reason) {
      setError((reason as Error).message);
      setStatusMessage('Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={rootRef}
      data-directory-app
      style={{
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: isCompactLayout ? 10 : 14,
        height: '100%',
        minHeight: 0,
        padding: isCompactLayout ? 10 : 14,
        background:
          'radial-gradient(circle at top, rgba(188,145,76,0.12), transparent 28%), linear-gradient(180deg, rgba(8,10,17,0.92), rgba(12,15,24,0.96))',
        color: 'var(--shell-text, #f4e7c8)'
      }}
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button, input, textarea, select, option, [contenteditable]')) {
          return;
        }
        if (target?.closest('[data-directory-entry-path]')) {
          return;
        }
        setSelectedPath(null);
      }}
      onMouseDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button, input, textarea, select, option, [contenteditable]')) {
          return;
        }
        if (target?.closest('[data-directory-entry-path]')) {
          return;
        }
        setSelectedPath(null);
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompactLayout
            ? 'minmax(0, 1fr)'
            : 'minmax(280px, 1.1fr) minmax(260px, 1fr)',
          gridTemplateRows: isCompactLayout ? 'minmax(180px, 0.95fr) minmax(220px, 1fr)' : undefined,
          gap: isCompactLayout ? 10 : 14,
          minHeight: 0
        }}
      >
        <section
          data-directory-list
          style={{
            overflow: 'auto',
            padding: isCompactLayout ? 12 : 14,
            borderRadius: 28,
            border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
            background:
              'linear-gradient(180deg, rgba(18,16,15,0.9), rgba(9,12,20,0.92))',
            boxShadow: '0 24px 50px rgba(3,5,10,0.28)'
          }}
          onPointerDown={(event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('[data-directory-entry-path]')) {
              return;
            }
            setSelectedPath(null);
          }}
        >
          {loadingList ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--shell-accent, #a8c0ac)' }}>
              Loading files...
            </p>
          ) : files.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: 'var(--shell-muted, rgba(244,231,200,0.72))'
              }}
            >
              No files yet. Right-click to create one.
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.directory}
                data-directory-group={group.directory}
                style={{ display: 'grid', gap: 10, marginBottom: isCompactLayout ? 14 : 18 }}
              >
                <strong
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--shell-accent, #a8c0ac)'
                  }}
                >
                  {group.directory}
                </strong>
                <div className="icon-grid">
                  {group.files.map((file) => {
                    const isSelected = file.path === selectedPath;
                    const isDescriptor =
                      file.path.toLowerCase().endsWith('.app') ||
                      file.path.toLowerCase().endsWith('.aionios-app.json');
                    const descriptor =
                      isDescriptor && typeof file.content === 'string' ? parseAppDescriptor(file.content) : null;
                    const label = descriptor ? descriptor.title : fileNameFromPath(file.path);
                    const emoji = descriptor ? descriptor.icon : resolveFileIcon(file.path);

                    return (
                      <button
                        key={file.path}
                        data-directory-entry-path={file.path}
                        type="button"
                        className={\`icon-tile\${isSelected ? ' icon-tile--selected' : ''}\`}
                        onClick={() => selectPath(file.path)}
                        onDoubleClick={() => {
                          if (descriptor) {
                            void host.openApp(descriptor.appId);
                            return;
                          }
                          void host.openFile(file.path);
                        }}
                        onContextMenu={() => selectPath(file.path)}
                        title={file.path}
                      >
                        <span className="icon-tile__emoji">{emoji}</span>
                        <span className="icon-tile__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateRows: 'auto auto minmax(0, 1fr)',
            gap: isCompactLayout ? 10 : 12,
            minHeight: 0,
            padding: isCompactLayout ? 12 : 16,
            borderRadius: 28,
            border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
            background:
              'linear-gradient(180deg, rgba(10,12,20,0.96), rgba(18,16,20,0.94))',
            boxShadow: '0 24px 50px rgba(3,5,10,0.28)'
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 17, letterSpacing: '0.04em' }}>Inspector</strong>
            <p
              style={{
                margin: 0,
                display: isShortLayout ? 'none' : undefined,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--shell-muted, rgba(244,231,200,0.72))'
              }}
            >
              Compose a new file or revise the selected entry before saving it back to the host.
            </p>
          </div>

          <label style={{ display: 'grid', gap: 6, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            <span style={{ color: 'var(--shell-accent, #a8c0ac)' }}>Path</span>
            <input
              data-directory-path
              value={draftPath}
              disabled={saving}
              onChange={(event) => setDraftPath(event.target.value)}
              style={{
                borderRadius: 18,
                border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
                background: 'rgba(17,20,31,0.86)',
                color: 'var(--shell-text-strong, #f1f7f2)',
                padding: '12px 14px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
              }}
            />
          </label>

          <label
            style={{
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              gap: 6,
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              minHeight: 0
            }}
          >
            <span style={{ color: 'var(--shell-accent, #a8c0ac)' }}>Preview / Editor</span>
            <textarea
              data-directory-content
              value={draftContent}
              disabled={saving || loadingFile}
              onChange={(event) => setDraftContent(event.target.value)}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                borderRadius: 24,
                border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
                background: 'rgba(11,14,24,0.92)',
                color: 'var(--shell-text-strong, #f1f7f2)',
                padding: isCompactLayout ? '14px 16px' : '16px 18px',
                resize: isCompactLayout ? 'none' : 'vertical',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 12,
                lineHeight: 1.6,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
              }}
            />
          </label>
        </section>
      </div>

      <footer
        style={{
          display: 'grid',
          gap: 8,
          padding: isCompactLayout ? '10px 12px' : '12px 14px',
          borderRadius: 24,
          border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
          background: 'rgba(10,13,22,0.82)'
        }}
      >
        <button
          data-directory-save
          type="button"
          disabled={!canSave}
          onClick={() => {
            void saveDraft();
          }}
          style={{
            justifySelf: isCompactLayout ? 'stretch' : 'start',
            borderRadius: 999,
            border: '1px solid rgba(168,192,172,0.32)',
            padding: '10px 16px',
            background: canSave
              ? 'linear-gradient(135deg, rgba(125,156,133,0.98), rgba(78,105,88,0.98))'
              : 'rgba(36,52,44,0.38)',
            color: '#f1f7f2',
            cursor: canSave ? 'pointer' : 'default',
            textAlign: 'center'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: error
              ? 'var(--shell-danger, #f4a6a1)'
              : 'var(--shell-success, #9bc9ac)'
          }}
        >
          {loadingFile ? 'Reading selected file...' : statusMessage}
        </p>
        {error ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--shell-danger, #f4a6a1)' }}>
            {error}
          </p>
        ) : null}
        <span data-directory-selected style={{ display: 'none' }}>{selectedLabel}</span>
      </footer>
    </div>
  );
}
`.trim();
