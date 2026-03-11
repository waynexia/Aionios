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
    <div
      data-media-app
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto auto 1fr',
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
          border: '1px solid var(--shell-border, rgba(201,171,102,0.24))',
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
          Load host media or paste a direct URL, then project it onto the shell wallpaper when needed.
        </p>
      </header>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          data-media-source
          list="media-source-options"
          value={sourceInput}
          onChange={(event) => setSourceInput(event.target.value)}
          placeholder="e.g. /photos/cat.jpg or https://example.com/song.mp3"
          style={{
            flex: 1,
            borderRadius: 18,
            border: '1px solid var(--shell-border, rgba(201,171,102,0.24))',
            background: 'rgba(17,20,31,0.86)',
            color: 'var(--shell-text-strong, #fff7e5)',
            padding: '12px 14px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
          }}
        />
        <button
          type="button"
          data-media-load
          onClick={() => {
            void loadSource();
          }}
          style={{
            borderRadius: 999,
            border: '1px solid rgba(226,192,116,0.34)',
            padding: '10px 16px',
            background: 'linear-gradient(135deg, rgba(171,118,47,0.98), rgba(110,55,21,0.98))',
            color: '#fff7e5',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: 11,
            fontWeight: 700
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
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--shell-muted, rgba(244,231,200,0.72))'
        }}
      >
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
            borderRadius: 999,
            border: '1px solid rgba(152,199,164,0.3)',
            padding: '10px 16px',
            background:
              canWallpaper && activeSource
                ? 'linear-gradient(135deg, rgba(60,119,79,0.96), rgba(31,82,54,0.96))'
                : 'rgba(62,50,32,0.38)',
            color: '#f7f3e8',
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
            borderRadius: 999,
            border: '1px solid var(--shell-border, rgba(201,171,102,0.24))',
            padding: '10px 16px',
            background: 'rgba(15,18,29,0.6)',
            color: 'var(--shell-text, #f4e7c8)',
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
          borderRadius: 30,
          border: '1px solid var(--shell-border, rgba(201,171,102,0.24))',
          background:
            'radial-gradient(circle at top, rgba(188,145,76,0.08), transparent 34%), linear-gradient(180deg, rgba(8,10,17,0.94), rgba(10,13,22,0.96))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18,
          overflow: 'auto',
          boxShadow: '0 24px 50px rgba(3,5,10,0.32)'
        }}
      >
        {activeKind === 'image' ? (
          <img
            src={activeSource}
            alt={sourceInput || 'media image'}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 22,
              boxShadow: '0 26px 70px rgba(0,0,0,0.34)'
            }}
          />
        ) : null}
        {activeKind === 'audio' ? (
          <audio src={activeSource} controls style={{ width: '100%', filter: 'sepia(0.22)' }} />
        ) : null}
        {activeKind === 'video' ? (
          <video
            src={activeSource}
            controls
            style={{
              width: '100%',
              maxHeight: '100%',
              borderRadius: 22,
              boxShadow: '0 26px 70px rgba(0,0,0,0.34)'
            }}
          />
        ) : null}
        {!activeKind ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--shell-muted, rgba(244,231,200,0.72))',
              textAlign: 'center'
            }}
          >
            {status}
          </p>
        ) : null}
      </section>
    </div>
  );
}
`.trim();
