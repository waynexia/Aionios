import type {
  SuggestArtifactMetadataRequest,
  SuggestArtifactMetadataResult
} from '../types';
import { unwrapCodeBlock } from './utils';

const EMOJI_CODEPOINT_RANGES = [
  [0x2600, 0x27bf],
  [0x1f300, 0x1f5ff],
  [0x1f600, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff]
] as const;

const EXTENDED_PICTOGRAPHIC_PATTERN = /^\p{Extended_Pictographic}$/u;
const NAME_WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const GENERIC_NAME_WORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'application',
  'build',
  'create',
  'file',
  'for',
  'generate',
  'generated',
  'make',
  'new',
  'of',
  'or',
  'the',
  'to',
  'tool',
  'window',
  'with'
]);

const TOTAL_CODEPOINT_SPAN = EMOJI_CODEPOINT_RANGES.reduce(
  (total, [start, end]) => total + (end - start + 1),
  0
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function collapseWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeExtension(extension: string | undefined) {
  if (!extension) {
    return '';
  }
  const trimmed = extension.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('.') ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`;
}

function sampleEmojiCodePoint(random: () => number) {
  let offset = Math.floor(random() * TOTAL_CODEPOINT_SPAN);
  for (const [start, end] of EMOJI_CODEPOINT_RANGES) {
    const span = end - start + 1;
    if (offset < span) {
      return start + offset;
    }
    offset -= span;
  }
  return 0x1f4a1;
}

function createSeededRandom(seedSource: string) {
  let state = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    state = (state * 31 + seedSource.charCodeAt(index)) >>> 0;
  }
  if (state === 0) {
    state = 0x12345678;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function fallbackEmoji(seedSource: string) {
  const random = createSeededRandom(seedSource);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = String.fromCodePoint(sampleEmojiCodePoint(random));
    if (EXTENDED_PICTOGRAPHIC_PATTERN.test(candidate)) {
      return candidate;
    }
  }
  return '🧩';
}

function sanitizeEmoji(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const candidate = Array.from(trimmed).find((char) => EXTENDED_PICTOGRAPHIC_PATTERN.test(char));
  return candidate ?? fallback;
}

function firstContentLine(input: string) {
  const line = input
    .split('\n')
    .map((entry) => collapseWhitespace(stripControlCharacters(entry)))
    .find((entry) => entry.length > 0);
  return line ?? '';
}

function fallbackTitle(input: SuggestArtifactMetadataRequest) {
  const firstLine = firstContentLine(input.instruction);
  if (firstLine) {
    return firstLine;
  }
  const providedTitle =
    typeof input.title === 'string' && input.title.trim().length > 0
      ? collapseWhitespace(stripControlCharacters(input.title))
      : '';
  if (providedTitle) {
    return providedTitle;
  }
  if (input.kind === 'app') {
    return 'New App';
  }
  if (input.kind === 'file') {
    return 'New File';
  }
  return 'Generated Window';
}

function defaultArtifactBaseName(kind: SuggestArtifactMetadataRequest['kind']) {
  if (kind === 'app') {
    return 'New App';
  }
  if (kind === 'file') {
    return 'New File';
  }
  return 'Generated Window';
}

function stripTrailingExtension(input: string, extension: string) {
  if (!input) {
    return '';
  }
  if (extension && input.toLowerCase().endsWith(extension)) {
    return input.slice(0, -extension.length);
  }
  const lastDotIndex = input.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return input.slice(0, lastDotIndex);
  }
  return input;
}

function extractNameWords(input: string) {
  const cleaned = collapseWhitespace(
    stripControlCharacters(input)
      .replaceAll('\\', ' ')
      .replaceAll('/', ' ')
      .replace(/[<>:"|?*`]+/g, ' ')
      .replace(/[-_]+/g, ' ')
  );
  const words = cleaned.match(NAME_WORD_PATTERN) ?? [];
  if (words.length === 0) {
    return [];
  }
  const filtered = words.filter((word) => !GENERIC_NAME_WORDS.has(word.toLowerCase()));
  return (filtered.length > 0 ? filtered : words).slice(0, 3);
}

function formatNameWord(word: string) {
  const chars = Array.from(word.trim());
  if (chars.length === 0) {
    return '';
  }
  const [head, ...tail] = chars;
  return `${head.toLocaleUpperCase()}${tail.join('').toLocaleLowerCase()}`;
}

function sanitizeSharedName(value: unknown, extension: string, fallback: string) {
  const raw = typeof value === 'string' ? value : '';
  const leaf = stripControlCharacters(raw)
    .replaceAll('\\', '/')
    .split('/')
    .at(-1) ?? '';
  const fallbackLeaf = stripControlCharacters(fallback)
    .replaceAll('\\', '/')
    .split('/')
    .at(-1) ?? '';
  const words = extractNameWords(stripTrailingExtension(leaf, extension));
  const fallbackWords = extractNameWords(stripTrailingExtension(fallbackLeaf, extension));
  const selectedWords = (words.length > 0 ? words : fallbackWords).map(formatNameWord);
  const fallbackBaseName = fallbackWords.map(formatNameWord).join('-');
  const defaultBaseName = fallbackBaseName || 'New-File';
  const candidateBaseName = selectedWords.join('-') || defaultBaseName;
  const maxBaseLength = Math.max(8, 42 - extension.length);
  const boundedBaseName =
    candidateBaseName.length > maxBaseLength
      ? candidateBaseName.slice(0, maxBaseLength).replace(/-+$/g, '')
      : candidateBaseName;
  const safeBaseName = boundedBaseName || candidateBaseName || defaultBaseName;
  return extension ? `${safeBaseName}${extension}` : safeBaseName;
}

function extractJsonObject(raw: string) {
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return raw;
  }
  return raw.slice(firstBrace, lastBrace + 1);
}

export function buildFallbackArtifactMetadata(
  input: SuggestArtifactMetadataRequest
): SuggestArtifactMetadataResult {
  const extension = normalizeExtension(input.extension);
  const sharedName = sanitizeSharedName(
    fallbackTitle(input),
    extension,
    defaultArtifactBaseName(input.kind)
  );
  return {
    emoji: fallbackEmoji(`${input.kind}:${input.appId ?? ''}:${input.instruction}:${sharedName}`),
    title: sharedName,
    fileName: sharedName,
    backend: 'fallback'
  };
}

export function buildArtifactMetadataPrompt(input: SuggestArtifactMetadataRequest) {
  const extension = normalizeExtension(input.extension);
  const expectedFileRule = extension
    ? `Both title and fileName must end with "${extension}".`
    : 'Do not add an extension unless the prompt clearly requires one.';
  return [
    'You are naming a generated artifact for a desktop environment.',
    'Return strict JSON only with this exact shape:',
    '{"emoji":"...", "title":"...", "fileName":"..."}',
    '',
    'Rules:',
    '- emoji must be exactly one emoji.',
    '- title and fileName must be exactly the same string.',
    '- Use at most three words.',
    '- Do not use spaces; join words with "-" if needed.',
    '- Keep the shared name short and human-readable.',
    `- ${expectedFileRule}`,
    '- title and fileName must not include directories.',
    '- Match the user prompt closely.',
    '',
    `Kind: ${input.kind}`,
    input.appId ? `App id: ${input.appId}` : null,
    input.title ? `Current title: ${input.title}` : null,
    extension ? `Expected extension: ${extension}` : null,
    'User prompt:',
    input.instruction
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseArtifactMetadataResponse(
  raw: string,
  input: SuggestArtifactMetadataRequest,
  backend: string
): SuggestArtifactMetadataResult {
  const fallback = buildFallbackArtifactMetadata(input);
  const normalized = unwrapCodeBlock(raw).trim();
  const jsonCandidate = extractJsonObject(normalized);

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    if (!isRecord(parsed)) {
      return {
        ...fallback,
        backend
      };
    }

    const extension = normalizeExtension(input.extension);
    const sharedName = sanitizeSharedName(
      typeof parsed.fileName === 'string' && parsed.fileName.trim().length > 0
        ? parsed.fileName
        : parsed.title,
      extension,
      fallback.fileName
    );
    return {
      emoji: sanitizeEmoji(parsed.emoji, fallback.emoji),
      title: sharedName,
      fileName: sharedName,
      backend
    };
  } catch {
    return {
      ...fallback,
      backend
    };
  }
}
