export const RECYCLE_BIN_WINDOW_SOURCE = `
import { useCallback, useEffect, useState } from 'react';

type RecycleBinItem = {
  id: string;
  originalPath: string;
  deletedAt: string;
  sizeBytes: number;
};

type RecycleBinBridge = {
  listItems: () => Promise<RecycleBinItem[]>;
  restore: (id: string) => Promise<{ restoredPath: string }>;
  deleteItem: (id: string) => Promise<void>;
  empty: () => Promise<{ emptied: number }>;
};

type WindowProps = {
  host: {
    windowId: string;
    recycleBin: RecycleBinBridge;
  };
  windowState: {
    title: string;
  };
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(decimals) + ' ' + units[unitIndex];
}

function formatDate(value: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }
    return date.toLocaleString();
  } catch {
    return value;
  }
}

function fileNameFromPath(path: string) {
  const normalized = path.replaceAll('\\\\', '/').trim();
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

export default function WindowApp({ host, windowState }: WindowProps) {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [status, setStatus] = useState('Loading recycle bin...');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus('Loading recycle bin...');
    try {
      const nextItems = await host.recycleBin.listItems();
      nextItems.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt, 'en-US'));
      setItems(nextItems);
      setSelectedItemId((current) => {
        if (current && nextItems.some((item) => item.id === current)) {
          return current;
        }
        return null;
      });
      setStatus(nextItems.length === 0 ? 'Recycle bin is empty.' : 'Loaded ' + nextItems.length + ' item(s).');
    } catch (reason) {
      setItems([]);
      setSelectedItemId(null);
      setError((reason as Error).message);
      setStatus('Failed to load recycle bin.');
    } finally {
      setLoading(false);
    }
  }, [host.recycleBin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener('aionios:fs-changed', handler);
    return () => {
      window.removeEventListener('aionios:fs-changed', handler);
    };
  }, [reload]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as
              | {
                  windowId?: unknown;
                  action?: unknown;
                  itemId?: unknown;
                  originalPath?: unknown;
                }
              | undefined)
          : undefined;
      if (!detail || detail.windowId !== host.windowId) {
        return;
      }
      if (detail.action === 'refresh') {
        void reload();
        return;
      }
      if (detail.action === 'empty') {
        void emptyBinImmediate();
        return;
      }
      if (detail.action === 'restore' && typeof detail.itemId === 'string') {
        void restoreItem(detail.itemId);
        return;
      }
      if (
        detail.action === 'delete' &&
        typeof detail.itemId === 'string' &&
        typeof detail.originalPath === 'string'
      ) {
        void deleteItem(detail.itemId, detail.originalPath);
      }
    };
    window.addEventListener('aionios:recycle-bin-action', handler);
    return () => {
      window.removeEventListener('aionios:recycle-bin-action', handler);
    };
  }, [deleteItem, emptyBinImmediate, host.windowId, reload, restoreItem]);

  async function restoreItem(id: string) {
    if (busyItemId || emptying) {
      return;
    }
    setBusyItemId(id);
    setError(null);
    setStatus('Restoring item...');
    try {
      const result = await host.recycleBin.restore(id);
      setStatus('Restored to ' + result.restoredPath + '.');
      await reload();
    } catch (reason) {
      setError((reason as Error).message);
      setStatus('Restore failed.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function deleteItem(id: string, originalPath: string) {
    if (busyItemId || emptying) {
      return;
    }
    if (!window.confirm('Permanently delete "' + originalPath + '" from the recycle bin?')) {
      return;
    }
    setBusyItemId(id);
    setError(null);
    setStatus('Deleting item permanently...');
    try {
      await host.recycleBin.deleteItem(id);
      await reload();
      setStatus('Deleted permanently.');
    } catch (reason) {
      setError((reason as Error).message);
      setStatus('Delete failed.');
    } finally {
      setBusyItemId(null);
    }
  }

  async function emptyBinImmediate() {
    if (busyItemId || emptying || items.length === 0) {
      return;
    }
    if (!window.confirm('Empty the recycle bin permanently?')) {
      return;
    }
    setEmptying(true);
    setError(null);
    setStatus('Emptying recycle bin...');
    try {
      const result = await host.recycleBin.empty();
      await reload();
      setStatus('Emptied ' + result.emptied + ' item(s).');
    } catch (reason) {
      setError((reason as Error).message);
      setStatus('Empty failed.');
    } finally {
      setEmptying(false);
    }
  }

  return (
    <div
      data-recycle-bin-app
      style={{
        display: 'grid',
        gridTemplateRows: '1fr auto',
        gap: 14,
        height: '100%',
        minHeight: 0,
        padding: 14,
        background:
          'radial-gradient(circle at top, rgba(188,145,76,0.12), transparent 28%), linear-gradient(180deg, rgba(8,10,17,0.92), rgba(12,15,24,0.96))',
        color: 'var(--shell-text, #f4e7c8)'
      }}
    >
      <section
        data-recycle-bin-list
        style={{
          overflow: 'auto',
          minHeight: 0,
          padding: 14,
          borderRadius: 28,
          border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
          background:
            'linear-gradient(180deg, rgba(18,16,15,0.9), rgba(9,12,20,0.92))',
          boxShadow: '0 24px 50px rgba(3,5,10,0.28)'
        }}
        onPointerDown={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest('[data-recycle-bin-item-id]')) {
            return;
          }
          setSelectedItemId(null);
        }}
      >
        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--shell-accent, #a8c0ac)' }}>
            Loading...
          </p>
        ) : items.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--shell-muted, rgba(244,231,200,0.72))'
            }}
          >
            Recycle bin is empty.
          </p>
        ) : (
          <div className="icon-grid">
            {items.map((item) => (
              <button
                key={item.id}
                data-recycle-bin-item={item.id}
                data-recycle-bin-item-id={item.id}
                data-recycle-bin-original-path={item.originalPath}
                type="button"
                className={\`icon-tile\${selectedItemId === item.id ? ' icon-tile--selected' : ''}\`}
                onClick={() => setSelectedItemId(item.id)}
                onDoubleClick={() => {
                  void restoreItem(item.id);
                }}
                onContextMenu={() => setSelectedItemId(item.id)}
                title={item.originalPath + ' — ' + formatBytes(item.sizeBytes) + ' — Deleted: ' + formatDate(item.deletedAt)}
              >
                <span className="icon-tile__emoji">{resolveFileIcon(item.originalPath)}</span>
                <span className="icon-tile__label">{fileNameFromPath(item.originalPath)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer
        style={{
          display: 'grid',
          gap: 8,
          padding: '12px 14px',
          borderRadius: 24,
          border: '1px solid var(--shell-border, rgba(168,192,172,0.24))',
          background: 'rgba(10,13,22,0.82)'
        }}
      >
        <p
          data-recycle-bin-status
          style={{
            margin: 0,
            fontSize: 12,
            color: error
              ? 'var(--shell-danger, #f4a6a1)'
              : 'var(--shell-success, #9bc9ac)'
          }}
        >
          {status}
        </p>
        {error ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--shell-danger, #f4a6a1)' }}>
            {error}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
`.trim();
