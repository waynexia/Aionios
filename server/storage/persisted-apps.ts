import fs from 'node:fs/promises';
import path from 'node:path';

export interface PersistedAppSnapshot {
  appId: string;
  title?: string;
  revision: number;
  source: string;
  updatedAt: string;
}

interface PersistedAppMeta {
  version: 1;
  appId: string;
  title?: string;
  revision: number;
  updatedAt: string;
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in (error as NodeJS.ErrnoException));
}

function isSafeAppId(appId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(appId);
}

export class PersistedAppStore {
  constructor(private readonly options: { rootDir: string; managedPrefix?: string }) {}

  isManagedAppId(appId: string) {
    const prefix = this.options.managedPrefix ?? 'app-';
    return appId.startsWith(prefix) && isSafeAppId(appId);
  }

  private getAppDir(appId: string) {
    if (!this.isManagedAppId(appId)) {
      throw new Error('Invalid persisted app id.');
    }
    return path.join(this.options.rootDir, appId);
  }

  private getEntryPath(appId: string) {
    return path.join(this.getAppDir(appId), 'entry.tsx');
  }

  private getMetaPath(appId: string) {
    return path.join(this.getAppDir(appId), 'meta.json');
  }

  async read(appId: string): Promise<PersistedAppSnapshot | null> {
    if (!this.isManagedAppId(appId)) {
      return null;
    }

    const entryPath = this.getEntryPath(appId);
    try {
      const [source, metaRaw, stat] = await Promise.all([
        fs.readFile(entryPath, 'utf8'),
        fs.readFile(this.getMetaPath(appId), 'utf8').catch((error) => {
          if (isErrno(error) && error.code === 'ENOENT') {
            return null;
          }
          throw error;
        }),
        fs.stat(entryPath)
      ]);

      let revision = 1;
      let title: string | undefined;
      let updatedAt = stat.mtime.toISOString();

      if (typeof metaRaw === 'string') {
        try {
          const parsed = JSON.parse(metaRaw) as PersistedAppMeta;
          if (parsed && parsed.version === 1 && parsed.appId === appId) {
            if (typeof parsed.revision === 'number' && Number.isFinite(parsed.revision) && parsed.revision >= 1) {
              revision = parsed.revision;
            }
            if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
              title = parsed.title.trim();
            }
            if (typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim().length > 0) {
              updatedAt = parsed.updatedAt.trim();
            }
          }
        } catch {
          // ignore bad metadata
        }
      }

      return {
        appId,
        title,
        revision,
        source,
        updatedAt
      };
    } catch (error) {
      if (isErrno(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async write(input: { appId: string; source: string; revision: number; title?: string }) {
    if (!this.isManagedAppId(input.appId)) {
      return;
    }

    const revision = Number.isFinite(input.revision) && input.revision >= 1 ? Math.floor(input.revision) : 1;
    const updatedAt = new Date().toISOString();
    const meta: PersistedAppMeta = {
      version: 1,
      appId: input.appId,
      title: typeof input.title === 'string' && input.title.trim().length > 0 ? input.title.trim() : undefined,
      revision,
      updatedAt
    };

    const entryPath = this.getEntryPath(input.appId);
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await Promise.all([
      fs.writeFile(entryPath, input.source, 'utf8'),
      fs.writeFile(this.getMetaPath(input.appId), JSON.stringify(meta, null, 2), 'utf8')
    ]);
  }
}

