export const DIRECTORY_WINDOW_SOURCE = `
import { useCallback, useEffect, useMemo, useState } from 'react';

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
      data-directory-app
      style={{
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 10,
        height: '100%',
        minHeight: 0,
        padding: 10
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(280px, 1fr)', gap: 12, minHeight: 0 }}>
        <section
          data-directory-list
          style={{
            overflow: 'auto',
            padding: 4
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
            <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>Loading files...</p>
          ) : files.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>No files yet. Right-click to create one.</p>
          ) : (
            groups.map((group) => (
              <div
                key={group.directory}
                data-directory-group={group.directory}
                style={{ display: 'grid', gap: 8, marginBottom: 14 }}
              >
                <strong style={{ fontSize: 12, color: '#93c5fd' }}>{group.directory}</strong>
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
            gap: 10,
            minHeight: 0,
            paddingLeft: 12,
            borderLeft: '1px solid rgba(148,163,184,0.22)'
          }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span>Path</span>
            <input
              data-directory-path
              value={draftPath}
              disabled={saving}
              onChange={(event) => setDraftPath(event.target.value)}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'rgba(15,23,42,0.85)',
                color: '#e2e8f0',
                padding: '8px 10px'
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 12, minHeight: 0 }}>
            <span>Preview / Editor</span>
            <textarea
              data-directory-content
              value={draftContent}
              disabled={saving || loadingFile}
              onChange={(event) => setDraftContent(event.target.value)}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 180,
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'rgba(15,23,42,0.85)',
                color: '#e2e8f0',
                padding: '8px 10px',
                resize: 'vertical',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 12
              }}
            />
          </label>
        </section>
      </div>

      <footer style={{ display: 'grid', gap: 6 }}>
        <button
          data-directory-save
          type="button"
          disabled={!canSave}
          onClick={() => {
            void saveDraft();
          }}
          style={{
            justifySelf: 'start',
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: canSave ? '#2563eb' : '#1e293b',
            color: '#f8fafc',
            cursor: canSave ? 'pointer' : 'default'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <p style={{ margin: 0, fontSize: 12, color: error ? '#fecaca' : '#bbf7d0' }}>
          {loadingFile ? 'Reading selected file...' : statusMessage}
        </p>
        {error ? <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p> : null}
        <span data-directory-selected style={{ display: 'none' }}>{selectedLabel}</span>
      </footer>
    </div>
  );
}
`.trim();
