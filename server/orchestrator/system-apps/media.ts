export const MEDIA_WINDOW_SOURCE = `
import { useEffect, useMemo, useState } from 'react';

type HostFileEntry = {
  path: string;
};

type WallpaperState = {
  kind: 'image' | 'video';
  source: string;
};

type HostBridge = {
  listFiles: () => Promise<HostFileEntry[]>;
  readFile: (path: string) => Promise<string>;
  setWallpaper: (wallpaper: WallpaperState | null) => Promise<void>;
};

type WindowProps = {
  host: HostBridge;
  windowState: {
    title: string;
    launch?: { kind: 'open-file'; path: string };
  };
};

type MediaKind = 'image' | 'audio' | 'video';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.ogv'];

function stripQueryAndHash(value: string) {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  let endIndex = value.length;
  if (queryIndex >= 0) {
    endIndex = Math.min(endIndex, queryIndex);
  }
  if (hashIndex >= 0) {
    endIndex = Math.min(endIndex, hashIndex);
  }
  return value.slice(0, endIndex).toLowerCase();
}

function detectMediaKind(value: string): MediaKind | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:image/')) {
    return 'image';
  }
  if (trimmed.startsWith('data:audio/')) {
    return 'audio';
  }
  if (trimmed.startsWith('data:video/')) {
    return 'video';
  }

  const normalized = stripQueryAndHash(trimmed);
  if (IMAGE_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return 'image';
  }
  if (AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return 'audio';
  }
  if (VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return 'video';
  }
  return null;
}

function isUrlLike(value: string) {
  const lowered = value.toLowerCase();
  return (
    lowered.startsWith('http://') ||
    lowered.startsWith('https://') ||
    lowered.startsWith('data:') ||
    lowered.startsWith('blob:') ||
    lowered.startsWith('/')
  );
}

function looksLikeSvgMarkup(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('<svg')) {
    return true;
  }
  if (trimmed.startsWith('<?xml') && trimmed.includes('<svg')) {
    return true;
  }
  return trimmed.includes('<svg') && trimmed.includes('</svg>');
}

function toSvgDataUrl(svgMarkup: string) {
  const encoded = encodeURIComponent(svgMarkup.trim());
  return 'data:image/svg+xml;charset=utf-8,' + encoded;
}

export default function WindowApp({ host, windowState }: WindowProps) {
  const launchPath =
    windowState.launch && windowState.launch.kind === 'open-file'
      ? windowState.launch.path.trim()
      : '';
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState(() => launchPath);
  const [activeSource, setActiveSource] = useState('');
  const [activeKind, setActiveKind] = useState<MediaKind | null>(null);
  const [status, setStatus] = useState('Loading host files...');
  const [autoOpenedLaunch, setAutoOpenedLaunch] = useState(false);

  useEffect(() => {
    let active = true;
    void host
      .listFiles()
      .then((entries) => {
        if (!active) {
          return;
        }
        const paths = entries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right, 'en-US'));
        setFilePaths(paths);
        setStatus(paths.length ? 'Pick a host file or paste a URL.' : 'No host files available. Paste a URL.');
      })
      .catch((reason) => {
        if (!active) {
          return;
        }
        setStatus('Unable to list host files: ' + (reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const mediaFiles = useMemo(
    () => filePaths.filter((path) => detectMediaKind(path) !== null),
    [filePaths]
  );

  useEffect(() => {
    if (sourceInput || launchPath || mediaFiles.length === 0) {
      return;
    }
    setSourceInput(mediaFiles[0]);
  }, [launchPath, mediaFiles, sourceInput]);

  useEffect(() => {
    if (!launchPath || autoOpenedLaunch) {
      return;
    }
    setAutoOpenedLaunch(true);
    void loadSource();
  }, [autoOpenedLaunch, launchPath]);

  async function loadSource() {
    const requestedSource = sourceInput.trim();
    if (!requestedSource) {
      setStatus('Enter a file path or media URL.');
      return;
    }

    let resolvedSource = requestedSource;
    const shouldResolveHostFile =
      (launchPath && requestedSource === launchPath) || mediaFiles.includes(requestedSource);
    if (shouldResolveHostFile) {
      try {
        const content = (await host.readFile(requestedSource)).trim();
        if (content) {
          if (isUrlLike(content) || detectMediaKind(content)) {
            resolvedSource = content;
          } else if (requestedSource.toLowerCase().endsWith('.svg') && looksLikeSvgMarkup(content)) {
            resolvedSource = toSvgDataUrl(content);
          }
        }
      } catch (reason) {
        setStatus('Unable to read host file: ' + (reason as Error).message);
        return;
      }
    }

    const kind = detectMediaKind(resolvedSource) ?? detectMediaKind(requestedSource);
    if (!kind) {
      setActiveKind(null);
      setActiveSource('');
      setStatus('Unsupported media type. Use image/audio/video extension or data URL.');
      return;
    }

    setActiveKind(kind);
    setActiveSource(resolvedSource);
    setStatus('Loaded ' + kind + '.');
  }

  async function updateWallpaper(next: WallpaperState | null) {
    if (typeof host.setWallpaper !== 'function') {
      setStatus('Wallpaper API is unavailable.');
      return;
    }
    try {
      setStatus(next ? 'Setting wallpaper...' : 'Clearing wallpaper...');
      await host.setWallpaper(next);
      setStatus(next ? 'Wallpaper updated.' : 'Wallpaper cleared.');
    } catch (reason) {
      setStatus('Wallpaper update failed: ' + (reason as Error).message);
    }
  }

  const canWallpaper = activeKind === 'image' || activeKind === 'video';

  return (
    <div data-media-app style={{ display: 'grid', gridTemplateRows: 'auto auto auto 1fr', gap: 10, height: '100%' }}>
      <header>
        <strong>{windowState.title}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>Open host files or paste any media URL.</p>
      </header>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          data-media-source
          list="media-source-options"
          value={sourceInput}
          onChange={(event) => setSourceInput(event.target.value)}
          placeholder="e.g. /photos/cat.jpg or https://example.com/song.mp3"
          style={{
            flex: 1,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'rgba(15,23,42,0.85)',
            color: '#e2e8f0',
            padding: '8px 10px'
          }}
        />
        <button
          type="button"
          data-media-load
          onClick={() => {
            void loadSource();
          }}
          style={{
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: '#2563eb',
            color: '#f8fafc',
            cursor: 'pointer'
          }}
        >
          Load
        </button>
        <datalist id="media-source-options">
          {mediaFiles.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>
        {mediaFiles.length > 0 ? 'Host media files: ' + mediaFiles.join(', ') : 'No host media files detected.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-media-set-wallpaper
          disabled={!canWallpaper || !activeSource}
          onClick={() => {
            if (!canWallpaper || !activeSource) {
              setStatus('Load an image or video first.');
              return;
            }
            void updateWallpaper({ kind: activeKind, source: activeSource } as WallpaperState);
          }}
          style={{
            borderRadius: 8,
            border: 0,
            padding: '8px 12px',
            background: canWallpaper && activeSource ? '#16a34a' : 'rgba(148,163,184,0.25)',
            color: '#f8fafc',
            cursor: canWallpaper && activeSource ? 'pointer' : 'not-allowed'
          }}
        >
          Set as Wallpaper
        </button>
        <button
          type="button"
          data-media-clear-wallpaper
          onClick={() => {
            void updateWallpaper(null);
          }}
          style={{
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.35)',
            padding: '8px 12px',
            background: 'transparent',
            color: '#e2e8f0',
            cursor: 'pointer'
          }}
        >
          Clear Wallpaper
        </button>
      </div>
      <section
        data-media-player
        style={{
          minHeight: 0,
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.35)',
          background: 'rgba(2,6,23,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
          overflow: 'auto'
        }}
      >
        {activeKind === 'image' ? (
          <img src={activeSource} alt={sourceInput || 'media image'} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        ) : null}
        {activeKind === 'audio' ? <audio src={activeSource} controls style={{ width: '100%' }} /> : null}
        {activeKind === 'video' ? <video src={activeSource} controls style={{ width: '100%', maxHeight: '100%' }} /> : null}
        {!activeKind ? (
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>{status}</p>
        ) : null}
      </section>
    </div>
  );
}
`.trim();
