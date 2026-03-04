export const APP_DESCRIPTOR_EXTENSION = '.aionios-app.json';

export type ParsedAppDescriptor = {
  appId: string;
  title: string;
  icon: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseAioniosAppDescriptor(content: string): ParsedAppDescriptor | null {
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
    const icon =
      typeof parsed.icon === 'string' && parsed.icon.trim().length > 0 ? parsed.icon.trim() : '🧩';
    return { appId: parsed.appId.trim(), title: parsed.title.trim(), icon };
  } catch {
    return null;
  }
}

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
  return value.slice(0, endIndex);
}

export function isMediaFilePath(inputPath: string) {
  const normalized = stripQueryAndHash(inputPath.trim().toLowerCase());
  return (
    IMAGE_EXTENSIONS.some((extension) => normalized.endsWith(extension)) ||
    AUDIO_EXTENSIONS.some((extension) => normalized.endsWith(extension)) ||
    VIDEO_EXTENSIONS.some((extension) => normalized.endsWith(extension))
  );
}

export function fileNameFromPath(inputPath: string) {
  const normalized = inputPath.replaceAll('\\', '/').trim();
  const splitIndex = normalized.lastIndexOf('/');
  return splitIndex === -1 ? normalized : normalized.slice(splitIndex + 1);
}

export function buildFileOpenWindowTitle(input: { appTitle: string; path: string }) {
  const suffix = ` — ${input.appTitle}`;
  const baseName = fileNameFromPath(input.path) || input.path || input.appTitle;
  const maxLength = 52;
  const maxBaseLength = Math.max(1, maxLength - suffix.length);
  const trimmedBase =
    baseName.length > maxBaseLength ? `${baseName.slice(0, Math.max(1, maxBaseLength - 1))}…` : baseName;
  return `${trimmedBase}${suffix}`;
}

