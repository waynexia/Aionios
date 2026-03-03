export const RECYCLE_BIN_WINDOW_SOURCE = `
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  if (name.endsWith('.aionios-app.json')) {
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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
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
        return nextItems[0]?.id ?? null;
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

  const filteredItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return items;
    }
    return items.filter((item) => item.originalPath.toLowerCase().includes(trimmed));
  }, [items, query]);

  async function restoreItem(id: string) {
    if (busyItemId || emptying) {
      return;
    }
    setBusyItemId(id);
    setConfirmEmpty(false);
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
    setConfirmEmpty(false);
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

  async function emptyBin() {
    if (busyItemId || emptying || items.length === 0) {
      return;
    }
    if (!confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }
    setEmptying(true);
    setConfirmEmpty(false);
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

  async function emptyBinImmediate() {
    if (busyItemId || emptying || items.length === 0) {
      return;
    }
    if (!window.confirm('Empty the recycle bin permanently?')) {
      return;
    }
    setEmptying(true);
    setConfirmEmpty(false);
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
    <div data-recycle-bin-app style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr auto', gap: 12, height: '100%' }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <strong>{windowState.title}</strong>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.85 }}>
          Restore deleted files or permanently remove them.
        </p>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, flex: 1 }}>
          <span style={{ color: '#bfdbfe' }}>Filter</span>
          <input
            data-recycle-bin-filter
            value={query}
            disabled={loading || emptying}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by original path"
            style={{
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
              padding: '8px 10px'
            }}
          />
        </label>
        <button
          data-recycle-bin-empty
          type="button"
          disabled={loading || emptying || items.length === 0}
          onClick={() => {
            void emptyBin();
          }}
          style={{
            alignSelf: 'end',
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: confirmEmpty ? '#dc2626' : items.length === 0 ? '#1e293b' : '#334155',
            color: '#f8fafc',
            cursor: loading || emptying || items.length === 0 ? 'default' : 'pointer'
          }}
          title={items.length === 0 ? 'Recycle bin is already empty' : confirmEmpty ? 'Click again to confirm' : 'Empty recycle bin'}
        >
          {emptying ? 'Emptying...' : confirmEmpty ? 'Confirm Empty' : 'Empty'}
        </button>
      </div>

      <section
        data-recycle-bin-list
        style={{
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.35)',
          background: 'rgba(2,6,23,0.4)',
          padding: 10,
          overflow: 'auto',
          minHeight: 0
        }}
      >
        {loading ? (
          <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>Loading...</p>
        ) : filteredItems.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#cbd5e1' }}>
            {items.length === 0 ? 'Recycle bin is empty.' : 'No matches.'}
          </p>
        ) : (
          <div className="icon-grid">
            {filteredItems.map((item) => (
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

      <footer style={{ display: 'grid', gap: 6 }}>
        <p data-recycle-bin-status style={{ margin: 0, fontSize: 12, color: error ? '#fecaca' : '#bbf7d0' }}>
          {status}
        </p>
        {error ? <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p> : null}
      </footer>
    </div>
  );
}
`.trim();
