import fs from 'node:fs/promises';
import path from 'node:path';

export interface HostFileEntry {
  path: string;
  content: string;
  updatedAt: string;
}

function normalizeVirtualPath(input: string): string {
  const trimmed = input.replaceAll('\\', '/').trim();
  const withoutPrefix = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  const withoutLeadingSlash = withoutPrefix.replace(/^\/+/, '');
  const segments = withoutLeadingSlash
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length === 0) {
    return '';
  }
  if (segments.some((segment) => segment === '..')) {
    throw new Error('Path traversal is not allowed.');
  }
  return segments.join('/');
}

function normalizeVirtualDir(input: string | undefined): string {
  if (!input) {
    return '';
  }
  const normalized = normalizeVirtualPath(input);
  return normalized;
}

async function listFilesRecursive(
  rootDir: string,
  currentDir: string
): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: Array<{ absolutePath: string; relativePath: string }> = [];
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(rootDir, absolutePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(rootDir, absolutePath)
      });
    }
  }
  return files;
}

export class HostFileSystem {
  constructor(private readonly options: { rootDir: string }) {}

  getRootDir() {
    return this.options.rootDir;
  }

  normalizePath(input: string) {
    const normalized = normalizeVirtualPath(input);
    if (!normalized) {
      throw new Error('Path is required.');
    }
    return normalized;
  }

  normalizeDir(input: string | undefined) {
    return normalizeVirtualDir(input);
  }

  resolvePath(virtualPath: string) {
    const normalized = this.normalizePath(virtualPath);
    const resolvedRoot = path.resolve(this.options.rootDir);
    const resolvedFile = path.resolve(resolvedRoot, normalized);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      throw new Error('Resolved path escapes the filesystem root.');
    }
    return resolvedFile;
  }

  async readFile(virtualPath: string): Promise<string> {
    const resolved = this.resolvePath(virtualPath);
    return await fs.readFile(resolved, 'utf8');
  }

  async writeFile(virtualPath: string, content: string): Promise<void> {
    const resolved = this.resolvePath(virtualPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');
  }

  async listFiles(): Promise<HostFileEntry[]> {
    const resolvedRoot = path.resolve(this.options.rootDir);
    try {
      const listed = await listFilesRecursive(resolvedRoot, resolvedRoot);
      const entries: HostFileEntry[] = [];
      for (const entry of listed) {
        const [content, stat] = await Promise.all([
          fs.readFile(entry.absolutePath, 'utf8'),
          fs.stat(entry.absolutePath)
        ]);
        const virtualPath = entry.relativePath.split(path.sep).join('/');
        entries.push({
          path: virtualPath,
          content,
          updatedAt: stat.mtime.toISOString()
        });
      }
      entries.sort((left, right) => left.path.localeCompare(right.path, 'en-US'));
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async fileExists(virtualPath: string): Promise<boolean> {
    const resolved = this.resolvePath(virtualPath);
    try {
      const stat = await fs.stat(resolved);
      return stat.isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async createUniqueFilePath(input: { directory?: string; baseName: string; extension: string }) {
    const directory = this.normalizeDir(input.directory);
    const normalizedBaseName = input.baseName.trim().length > 0 ? input.baseName.trim() : 'new';
    const safeBaseName = normalizedBaseName.replaceAll('/', '-').replaceAll('\\', '-');
    const extension = input.extension.startsWith('.') ? input.extension : `.${input.extension}`;

    const prefix = directory ? `${directory}/` : '';
    const candidate = `${prefix}${safeBaseName}${extension}`;
    if (!(await this.fileExists(candidate))) {
      return candidate;
    }

    for (let suffix = 2; suffix <= 999; suffix += 1) {
      const attempt = `${prefix}${safeBaseName}-${String(suffix)}${extension}`;
      if (!(await this.fileExists(attempt))) {
        return attempt;
      }
    }

    throw new Error('Unable to pick a unique file name.');
  }
}

