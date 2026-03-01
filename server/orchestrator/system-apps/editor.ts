export const EDITOR_WINDOW_SOURCE = `
import { useEffect, useMemo, useState } from 'react';

type HostFileEntry = {
  path: string;
  content: string;
  updatedAt: string;
};

type WindowProps = {
  host: {
    listFiles: () => Promise<HostFileEntry[]>;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  };
  windowState: {
    title: string;
  };
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: 'javascript',
  css: 'css',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rs: 'rust',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'text',
  yaml: 'yaml',
  yml: 'yaml'
};

function inferLanguage(path: string): string {
  const parts = path.toLowerCase().split('.');
  if (parts.length < 2) {
    return 'text';
  }
  const extension = parts[parts.length - 1] ?? '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function plainCodeHtml(value: string): string {
  return '<pre class="shiki" style="background-color:#0f172a;color:#e2e8f0"><code>' + escapeHtml(value) + '</code></pre>';
}

export default function WindowApp({ host, windowState }: WindowProps) {
  const [files, setFiles] = useState<HostFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Loading files...');
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [highlighting, setHighlighting] = useState(false);

  const hasUnsavedChanges = useMemo(
    () => Boolean(selectedPath) && content !== savedContent,
    [content, savedContent, selectedPath]
  );

  async function loadFile(path: string, canCommit: () => boolean = () => true) {
    if (!canCommit()) {
      return;
    }
    setSelectedPath(path);
    setLoadingFile(true);
    setError(null);
    setStatus('Loading ' + path + '...');
    try {
      const nextContent = await host.readFile(path);
      if (!canCommit()) {
        return;
      }
      setContent(nextContent);
      setSavedContent(nextContent);
      setStatus('Loaded ' + path + '.');
    } catch (reason) {
      if (!canCommit()) {
        return;
      }
      const message = (reason as Error).message;
      setContent('');
      setSavedContent('');
      setError(message);
      setStatus('Unable to load ' + path + '.');
    } finally {
      if (canCommit()) {
        setLoadingFile(false);
      }
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingFiles(true);
      setError(null);
      setStatus('Loading files...');
      try {
        const entries = await host.listFiles();
        if (!active) {
          return;
        }
        const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
        setFiles(sorted);
        if (sorted.length === 0) {
          setSelectedPath('');
          setContent('');
          setSavedContent('');
          setStatus('No files available.');
          return;
        }
        const firstPath = sorted[0]?.path;
        if (firstPath) {
          await loadFile(firstPath, () => active);
        }
      } catch (reason) {
        if (!active) {
          return;
        }
        const message = (reason as Error).message;
        setFiles([]);
        setSelectedPath('');
        setContent('');
        setSavedContent('');
        setError(message);
        setStatus('Unable to list files.');
      } finally {
        if (active) {
          setLoadingFiles(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setPreviewHtml(plainCodeHtml('// Select a file to preview syntax highlighting.'));
      setPreviewError(null);
      return;
    }

    let active = true;
    const language = inferLanguage(selectedPath);
    setHighlighting(true);
    setPreviewError(null);

    void (async () => {
      try {
        const shiki = await import('shiki');
        const highlighted = await shiki.codeToHtml(content.length > 0 ? content : '\\n', {
          lang: language,
          theme: 'github-dark'
        });
        if (!active) {
          return;
        }
        setPreviewHtml(highlighted);
      } catch (reason) {
        if (!active) {
          return;
        }
        const message = (reason as Error).message;
        setPreviewError(message);
        setPreviewHtml(plainCodeHtml(content));
      } finally {
        if (active) {
          setHighlighting(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [content, selectedPath]);

  async function saveFile() {
    if (!selectedPath || saving || !hasUnsavedChanges) {
      return;
    }
    setSaving(true);
    setError(null);
    setStatus('Saving ' + selectedPath + '...');
    try {
      await host.writeFile(selectedPath, content);
      setSavedContent(content);
      setFiles((current) =>
        current.map((entry) =>
          entry.path === selectedPath
            ? {
                ...entry,
                content,
                updatedAt: new Date().toISOString()
              }
            : entry
        )
      );
      setStatus('Saved ' + selectedPath + '.');
    } catch (reason) {
      const message = (reason as Error).message;
      setError(message);
      setStatus('Unable to save ' + selectedPath + '.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-editor-app style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12, height: '100%' }}>
      <header>
        <strong>{windowState.title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
          Browse host files, edit source, and preview syntax highlighting.
        </p>
      </header>

      <ul
        data-editor-files
        style={{
          display: 'flex',
          gap: 8,
          margin: 0,
          padding: 0,
          overflowX: 'auto',
          listStyle: 'none'
        }}
      >
        {files.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => {
                void loadFile(entry.path);
              }}
              disabled={loadingFiles || loadingFile || saving}
              style={{
                borderRadius: 8,
                border: selectedPath === entry.path ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.35)',
                background: selectedPath === entry.path ? 'rgba(30,64,175,0.4)' : 'rgba(15,23,42,0.8)',
                color: '#e2e8f0',
                cursor: loadingFiles || loadingFile || saving ? 'default' : 'pointer',
                padding: '6px 10px',
                whiteSpace: 'nowrap'
              }}
            >
              {entry.path}
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'grid', gap: 10, minHeight: 0, gridTemplateRows: '1fr auto 1fr' }}>
        <textarea
          data-editor-textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={!selectedPath || loadingFiles || loadingFile || saving}
          spellCheck={false}
          placeholder={loadingFiles ? 'Loading files...' : 'Select a file to edit.'}
          style={{
            width: '100%',
            minHeight: 0,
            resize: 'none',
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.85)',
            color: '#e2e8f0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            padding: 12
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            data-editor-save
            type="button"
            onClick={() => {
              void saveFile();
            }}
            disabled={!selectedPath || loadingFiles || loadingFile || saving || !hasUnsavedChanges}
            style={{
              borderRadius: 8,
              border: 0,
              padding: '8px 12px',
              background: '#2563eb',
              color: '#f8fafc',
              cursor:
                !selectedPath || loadingFiles || loadingFile || saving || !hasUnsavedChanges
                  ? 'default'
                  : 'pointer'
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span style={{ fontSize: 12, color: error ? '#fecaca' : '#bfdbfe' }}>{status}</span>
          {highlighting ? <span style={{ fontSize: 12, color: '#fcd34d' }}>Updating preview…</span> : null}
          {previewError ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{previewError}</span> : null}
        </div>
        <div
          data-editor-preview
          style={{
            minHeight: 0,
            overflow: 'auto',
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.35)',
            background: '#0f172a',
            padding: 10
          }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}
`.trim();
