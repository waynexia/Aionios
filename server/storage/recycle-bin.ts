import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { APP_DESCRIPTOR_EXTENSION } from './app-descriptors';
import type { HostFileSystem } from './host-fs';

export interface RecycleBinItem {
  id: string;
  originalPath: string;
  deletedAt: string;
  sizeBytes: number;
}

interface RecycleBinMetaV1 extends RecycleBinItem {
  version: 1;
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in (error as NodeJS.ErrnoException));
}

function isSafeId(value: string) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function isMetaV1(value: unknown): value is RecycleBinMetaV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.id === 'string' &&
    typeof record.originalPath === 'string' &&
    typeof record.deletedAt === 'string' &&
    typeof record.sizeBytes === 'number'
  );
}

async function moveFile(sourcePath: string, destinationPath: string) {
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (isErrno(error) && error.code === 'EXDEV') {
      await fs.copyFile(sourcePath, destinationPath);
      await fs.unlink(sourcePath);
      return;
    }
    throw error;
  }
}

function splitFileName(name: string) {
  if (name.endsWith(APP_DESCRIPTOR_EXTENSION)) {
    const base = name.slice(0, Math.max(0, name.length - APP_DESCRIPTOR_EXTENSION.length));
    return { base, extension: APP_DESCRIPTOR_EXTENSION };
  }
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return { base: name, extension: '' };
  }
  return { base: name.slice(0, dotIndex), extension: name.slice(dotIndex) };
}

async function pickRestorePath(hostFs: HostFileSystem, originalPath: string) {
  const normalizedOriginal = hostFs.normalizePath(originalPath);
  if (!(await hostFs.fileExists(normalizedOriginal))) {
    return normalizedOriginal;
  }

  const normalized = normalizedOriginal.replaceAll('\\', '/');
  const splitIndex = normalized.lastIndexOf('/');
  const directory = splitIndex === -1 ? '' : normalized.slice(0, splitIndex);
  const fileName = splitIndex === -1 ? normalized : normalized.slice(splitIndex + 1);
  const { base, extension } = splitFileName(fileName);
  const prefix = directory.length > 0 ? `${directory}/` : '';

  const baseCandidate = `${prefix}${base} (restored)${extension}`;
  if (!(await hostFs.fileExists(baseCandidate))) {
    return baseCandidate;
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${prefix}${base} (restored ${String(suffix)})${extension}`;
    if (!(await hostFs.fileExists(candidate))) {
      return candidate;
    }
  }

  throw new Error('Unable to pick a restore path (all candidates are taken).');
}

export class RecycleBinItemNotFoundError extends Error {
  constructor() {
    super('Recycle bin item not found.');
    this.name = 'RecycleBinItemNotFoundError';
  }
}

export class RecycleBinStore {
  constructor(private readonly options: { rootDir: string }) {}

  private getItemsDir() {
    return path.join(this.options.rootDir, 'items');
  }

  private resolveItemDir(id: string) {
    const trimmed = id.trim();
    if (!trimmed || !isSafeId(trimmed)) {
      throw new Error('Invalid recycle bin id.');
    }
    return path.join(this.getItemsDir(), trimmed);
  }

  private getItemMetaPath(id: string) {
    return path.join(this.resolveItemDir(id), 'meta.json');
  }

  private getItemPayloadPath(id: string) {
    return path.join(this.resolveItemDir(id), 'payload');
  }

  private async readMeta(id: string): Promise<RecycleBinMetaV1> {
    const metaPath = this.getItemMetaPath(id);
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isMetaV1(parsed)) {
        throw new Error('Recycle bin metadata is corrupted.');
      }
      return parsed;
    } catch (error) {
      if (isErrno(error) && error.code === 'ENOENT') {
        throw new RecycleBinItemNotFoundError();
      }
      throw error;
    }
  }

  async listItems(): Promise<RecycleBinItem[]> {
    const itemsDir = this.getItemsDir();
    try {
      const entries = await fs.readdir(itemsDir, { withFileTypes: true });
      const items: RecycleBinItem[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (!isSafeId(entry.name)) {
          continue;
        }
        const metaPath = path.join(itemsDir, entry.name, 'meta.json');
        try {
          const raw = await fs.readFile(metaPath, 'utf8');
          const parsed = JSON.parse(raw) as unknown;
          if (!isMetaV1(parsed)) {
            continue;
          }
          items.push({
            id: parsed.id,
            originalPath: parsed.originalPath,
            deletedAt: parsed.deletedAt,
            sizeBytes: parsed.sizeBytes
          });
        } catch (error) {
          if (isErrno(error) && error.code === 'ENOENT') {
            continue;
          }
          throw error;
        }
      }
      items.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt, 'en-US'));
      return items;
    } catch (error) {
      if (isErrno(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async trashHostFile(hostFs: HostFileSystem, virtualPath: string): Promise<RecycleBinItem> {
    const normalizedPath = hostFs.normalizePath(virtualPath);
    const resolvedSource = hostFs.resolvePath(normalizedPath);
    const stat = await fs.stat(resolvedSource);
    if (!stat.isFile()) {
      throw new Error('Only files can be moved to the recycle bin.');
    }

    const id = nanoid(12);
    const itemDir = this.resolveItemDir(id);
    await fs.mkdir(itemDir, { recursive: true });
    const payloadPath = this.getItemPayloadPath(id);

    const deletedAt = new Date().toISOString();
    let moved = false;
    try {
      await moveFile(resolvedSource, payloadPath);
      moved = true;
      const meta: RecycleBinMetaV1 = {
        version: 1,
        id,
        originalPath: normalizedPath,
        deletedAt,
        sizeBytes: stat.size
      };
      await fs.writeFile(this.getItemMetaPath(id), JSON.stringify(meta, null, 2), 'utf8');
      return {
        id,
        originalPath: normalizedPath,
        deletedAt,
        sizeBytes: stat.size
      };
    } catch (error) {
      if (moved) {
        try {
          await fs.mkdir(path.dirname(resolvedSource), { recursive: true });
          await moveFile(payloadPath, resolvedSource);
          await fs.rm(itemDir, { recursive: true, force: true });
        } catch {
          // keep the item dir for manual recovery if rollback fails
        }
      } else {
        await fs.rm(itemDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async restoreItem(hostFs: HostFileSystem, id: string): Promise<{ restoredPath: string }> {
    const meta = await this.readMeta(id);
    const payloadPath = this.getItemPayloadPath(id);

    const restoredPath = await pickRestorePath(hostFs, meta.originalPath);
    const resolvedTarget = hostFs.resolvePath(restoredPath);
    await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

    await moveFile(payloadPath, resolvedTarget);
    await fs.rm(this.resolveItemDir(id), { recursive: true, force: true });

    return { restoredPath };
  }

  async deleteItem(id: string): Promise<boolean> {
    const itemDir = this.resolveItemDir(id);
    try {
      await fs.stat(itemDir);
    } catch (error) {
      if (isErrno(error) && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
    await fs.rm(itemDir, { recursive: true, force: true });
    return true;
  }

  async empty(): Promise<{ emptied: number }> {
    const items = await this.listItems();
    await fs.rm(this.getItemsDir(), { recursive: true, force: true });
    return { emptied: items.length };
  }
}
