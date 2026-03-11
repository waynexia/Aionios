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
    launch?: { kind: 'open-file'; path: string };
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

  const launchPath =
    windowState.launch && windowState.launch.kind === 'open-file'
      ? windowState.launch.path.trim()
      : '';

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
        const initialPath = launchPath || firstPath;
        if (initialPath) {
          await loadFile(initialPath, () => active);
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
        const shiki = await import('shiki/bundle/web');
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
    <div
      data-editor-app
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr',
        gap: 14,
        height: '100%',
        padding: 14,
        background:
          'radial-gradient(circle at top, rgba(188,145,76,0.12), transparent 30%), linear-gradient(180deg, rgba(8,10,17,0.92), rgba(12,15,24,0.96))',
        color: 'var(--shell-text, #f4e7c8)'
      }}
    >
      <header
        style={{
          display: 'grid',
          gap: 6,
          padding: '16px 18px',
          borderRadius: 24,
          border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
          background:
            'linear-gradient(145deg, rgba(26,22,18,0.92), rgba(15,18,29,0.94))',
          boxShadow: '0 24px 50px rgba(3,5,10,0.3)'
        }}
      >
        <strong style={{ fontSize: 18, letterSpacing: '0.04em' }}>{windowState.title}</strong>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--shell-muted, rgba(244,231,200,0.72))'
          }}
        >
          Browse host files, revise source, and monitor the rendered code sample in parallel.
        </p>
        <span data-editor-selected style={{ display: 'none' }}>{selectedPath}</span>
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
                borderRadius: 999,
                border:
                  selectedPath === entry.path
                    ? '1px solid rgba(168,192,172,0.7)'
                    : '1px solid var(--shell-border, rgba(168,192,172,0.24))',
                background:
                  selectedPath === entry.path
                    ? 'linear-gradient(135deg, rgba(72,102,83,0.94), rgba(31,45,38,0.94))'
                    : 'rgba(14,21,18,0.72)',
                color:
                  selectedPath === entry.path
                    ? 'var(--shell-text-strong, #f1f7f2)'
                    : 'var(--shell-text, #d9e6dd)',
                cursor: loadingFiles || loadingFile || saving ? 'default' : 'pointer',
                padding: '8px 14px',
                whiteSpace: 'nowrap',
                boxShadow:
                  selectedPath === entry.path
                    ? '0 10px 24px rgba(9,10,16,0.22)'
                    : 'none'
              }}
            >
              {entry.path}
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          display: 'grid',
          gap: 12,
          minHeight: 0,
          gridTemplateRows: '1.1fr auto 1fr'
        }}
      >
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
            borderRadius: 24,
            border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
            background: 'linear-gradient(180deg, rgba(14,16,25,0.96), rgba(9,12,20,0.92))',
            color: 'var(--shell-text-strong, #f1f7f2)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            padding: 18,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)'
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
              borderRadius: 999,
              border: '1px solid rgba(168,192,172,0.32)',
              padding: '10px 16px',
              background:
                !selectedPath || loadingFiles || loadingFile || saving || !hasUnsavedChanges
                  ? 'rgba(36,52,44,0.38)'
                  : 'linear-gradient(135deg, rgba(125,156,133,0.98), rgba(78,105,88,0.98))',
              color: '#f1f7f2',
              cursor:
                !selectedPath || loadingFiles || loadingFile || saving || !hasUnsavedChanges
                  ? 'default'
                  : 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontSize: 11,
              fontWeight: 700
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span
            style={{
              fontSize: 12,
              color: error
                ? 'var(--shell-danger, #f4a6a1)'
                : 'var(--shell-muted, rgba(244,231,200,0.72))'
            }}
          >
            {status}
          </span>
          {highlighting ? (
            <span style={{ fontSize: 12, color: 'var(--shell-accent, #a8c0ac)' }}>
              Updating preview…
            </span>
          ) : null}
          {previewError ? (
            <span style={{ fontSize: 12, color: 'var(--shell-danger, #f4a6a1)' }}>
              {previewError}
            </span>
          ) : null}
        </div>
        <div
          data-editor-preview
          style={{
            minHeight: 0,
            overflow: 'auto',
            borderRadius: 24,
            border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
            background: 'linear-gradient(180deg, rgba(10,12,20,0.98), rgba(18,16,20,0.94))',
            padding: 14,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
          }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}
`.trim();
