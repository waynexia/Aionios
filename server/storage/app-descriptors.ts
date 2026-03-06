import { HostFileSystem } from './host-fs';

export const APP_DESCRIPTOR_EXTENSION = '.app';
export const LEGACY_APP_DESCRIPTOR_EXTENSION = '.aionios-app.json';
export const APP_DESCRIPTOR_EXTENSIONS = [APP_DESCRIPTOR_EXTENSION, LEGACY_APP_DESCRIPTOR_EXTENSION] as const;

export function isAppDescriptorPath(inputPath: string) {
  const normalized = inputPath.trim().toLowerCase();
  return APP_DESCRIPTOR_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export interface AppDescriptorV1 {
  kind: 'aionios.app';
  version: 1;
  appId: string;
  title: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedAppDescriptor {
  appId: string;
  title: string;
  icon: string;
  path: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDirectoryFromPath(virtualPath: string) {
  const splitIndex = virtualPath.lastIndexOf('/');
  if (splitIndex === -1) {
    return '/';
  }
  const directory = virtualPath.slice(0, splitIndex);
  return directory.length > 0 ? directory : '/';
}

function stripControlCharacters(input: string) {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) {
      continue;
    }
    result += char;
  }
  return result;
}

export function deriveDescriptorBaseName(title: string) {
  const trimmed = title.trim();
  const collapsed = trimmed.replace(/\s+/g, ' ').trim();
  const replacedSlashes = collapsed.replaceAll('/', '-').replaceAll('\\', '-');
  const withoutControl = stripControlCharacters(replacedSlashes);
  const maxLength = 42;
  const bounded = withoutControl.length > maxLength ? withoutControl.slice(0, maxLength).trim() : withoutControl;
  return bounded.length > 0 ? bounded : 'New App';
}

function parseDescriptor(content: string): AppDescriptorV1 | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    if (parsed.kind !== 'aionios.app' || parsed.version !== 1) {
      return null;
    }
    if (typeof parsed.appId !== 'string' || parsed.appId.trim().length === 0) {
      return null;
    }
    if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
      return null;
    }
    if (typeof parsed.icon !== 'string' || parsed.icon.trim().length === 0) {
      return null;
    }
    if (typeof parsed.createdAt !== 'string' || parsed.createdAt.trim().length === 0) {
      return null;
    }
    if (typeof parsed.updatedAt !== 'string' || parsed.updatedAt.trim().length === 0) {
      return null;
    }

    return {
      kind: 'aionios.app',
      version: 1,
      appId: parsed.appId.trim(),
      title: parsed.title.trim(),
      icon: parsed.icon.trim(),
      createdAt: parsed.createdAt.trim(),
      updatedAt: parsed.updatedAt.trim()
    };
  } catch {
    return null;
  }
}

export async function listAppDescriptors(hostFs: HostFileSystem, input?: { directory?: string }) {
  const hasDirectoryFilter = Object.prototype.hasOwnProperty.call(input ?? {}, 'directory');
  const targetDirectory = hasDirectoryFilter ? hostFs.normalizeDir(input?.directory) : null;
  const files = await hostFs.listFileMetadata();
  const descriptors: PersistedAppDescriptor[] = [];

  for (const file of files) {
    if (!isAppDescriptorPath(file.path)) {
      continue;
    }
    const parsed = parseDescriptor(await hostFs.readFile(file.path));
    if (!parsed) {
      continue;
    }
    const directory = normalizeDirectoryFromPath(file.path);
    if (targetDirectory !== null) {
      const normalizedTarget = targetDirectory.length > 0 ? targetDirectory : '/';
      if (normalizedTarget !== '/' && directory !== normalizedTarget) {
        continue;
      }
      if (normalizedTarget === '/' && directory !== '/') {
        continue;
      }
    }
    descriptors.push({
      appId: parsed.appId,
      title: parsed.title,
      icon: parsed.icon,
      path: file.path,
      directory,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt
    });
  }

  descriptors.sort((left, right) => left.title.localeCompare(right.title, 'en-US'));
  return descriptors;
}

export async function createAppDescriptor(
  hostFs: HostFileSystem,
  input: { directory?: string; appId: string; title: string; icon?: string }
): Promise<PersistedAppDescriptor> {
  const normalizedDir = hostFs.normalizeDir(input.directory);
  const createdAt = new Date().toISOString();
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error('title is required.');
  }
  const icon =
    typeof input.icon === 'string' && input.icon.trim().length > 0 ? input.icon.trim() : '🧩';

  const baseName = deriveDescriptorBaseName(title);
  const descriptorPath = await hostFs.createUniqueFilePath({
    directory: normalizedDir,
    baseName,
    extension: APP_DESCRIPTOR_EXTENSION
  });

  const descriptor: AppDescriptorV1 = {
    kind: 'aionios.app',
    version: 1,
    appId: input.appId,
    title,
    icon,
    createdAt,
    updatedAt: createdAt
  };

  await hostFs.writeFile(descriptorPath, JSON.stringify(descriptor, null, 2));

  return {
    appId: descriptor.appId,
    title: descriptor.title,
    icon: descriptor.icon,
    path: descriptorPath,
    directory: normalizedDir.length > 0 ? normalizedDir : '/',
    createdAt: descriptor.createdAt,
    updatedAt: descriptor.updatedAt
  };
}
