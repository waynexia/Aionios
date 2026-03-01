export const DIRECTORY_WINDOW_SOURCE = `
import { useEffect, useMemo, useState } from 'react';

type FileEntry = {
  path: string;
};

type DirectoryGroup = {
  directory: string;
  files: string[];
};

type WindowProps = {
  host: {
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

function toDirectoryGroups(paths: string[]): DirectoryGroup[] {
  const grouped = new Map<string, string[]>();
  for (const path of paths) {
    const splitIndex = path.lastIndexOf('/');
    const directory = splitIndex === -1 ? '/' : path.slice(0, splitIndex);
    const files = grouped.get(directory);
    if (files) {
      files.push(path);
    } else {
      grouped.set(directory, [path]);
    }
  }
  return [...grouped.entries()]
    .map(([directory, files]) => ({
      directory,
      files: [...files].sort((left, right) => left.localeCompare(right, 'en-US'))
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

export default function WindowApp({ host, windowState }: WindowProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState('notes/new-file.txt');
  const [draftContent, setDraftContent] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Loading files...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    void host.listFiles()
      .then((entries) => {
        if (!active) {
          return;
        }
        const nextPaths = toPaths(entries);
        setPaths(nextPaths);
        setSelectedPath((current) => {
          if (current && nextPaths.includes(current)) {
            return current;
          }
          return nextPaths[0] ?? null;
        });
        if (nextPaths.length === 0) {
          setStatusMessage('No files found. Create one below.');
        } else {
          setStatusMessage('Loaded ' + nextPaths.length + ' file(s).');
        }
        setError(null);
        setLoadingList(false);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setError((reason as Error).message);
        setStatusMessage('Failed to load files.');
        setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
        setStatusMessage('Loaded ' + selectedPath + '.');
        setLoadingFile(false);
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setError((reason as Error).message);
        setStatusMessage('Failed to load selected file.');
        setLoadingFile(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPath]);

  const groups = useMemo(() => toDirectoryGroups(paths), [paths]);
  const selectedLabel = selectedPath ?? '(new file)';
  const canSave = !saving && !loadingList && draftPath.trim().length > 0;

  function createNewFileDraft() {
    setSelectedPath(null);
    setError(null);
    setDraftContent('');
    setStatusMessage('Creating a new file draft.');
  }

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
      const listed = await host.listFiles();
      const nextPaths = toPaths(listed);
      if (!nextPaths.includes(normalizedPath)) {
        nextPaths.push(normalizedPath);
        nextPaths.sort((left, right) => left.localeCompare(right, 'en-US'));
      }
      setPaths(nextPaths);
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
        gridTemplateRows: 'auto auto 1fr auto',
        gap: 10,
        height: '100%'
      }}
    >
      <header>
        <strong>{windowState.title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
          Browse host files, preview text content, and save edits.
        </p>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span data-directory-selected style={{ fontSize: 12, color: '#bfdbfe' }}>
          {selectedLabel}
        </span>
        <button
          type="button"
          onClick={createNewFileDraft}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'transparent',
            color: '#e2e8f0',
            padding: '6px 10px',
            cursor: 'pointer'
          }}
        >
          New File
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(260px, 2fr)', gap: 10, minHeight: 0 }}>
        <section
          data-directory-list
          style={{
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(2,6,23,0.4)',
            overflow: 'auto',
            padding: 8
          }}
        >
          {loadingList ? (
            <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>Loading files...</p>
          ) : paths.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>No files yet.</p>
          ) : (
            groups.map((group) => (
              <div key={group.directory} style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
                <strong style={{ fontSize: 12, color: '#93c5fd' }}>{group.directory}</strong>
                {group.files.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setSelectedPath(path)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 8,
                      border: path === selectedPath ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.25)',
                      background: path === selectedPath ? 'rgba(37,99,235,0.28)' : 'rgba(15,23,42,0.35)',
                      color: '#e2e8f0',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    {path}
                  </button>
                ))}
              </div>
            ))
          )}
        </section>

        <section
          style={{
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(2,6,23,0.4)',
            padding: 10,
            display: 'grid',
            gap: 8,
            minHeight: 0
          }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span>Path</span>
            <input
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
      </footer>
    </div>
  );
}
`.trim();
