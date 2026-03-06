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

function fallbackBaseNameForExtension(extension: string) {
  if (extension === '.svg') {
    return 'New Image';
  }
  if (extension === '.md') {
    return 'New Document';
  }
  if (extension === '.txt') {
    return 'New Text';
  }
  if (extension === '.json') {
    return 'data';
  }
  if (extension === '.html') {
    return 'index';
  }
  return 'New File';
}

export function randomWindowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `window-${Math.random().toString(36).slice(2, 11)}`;
}

export function deriveWindowTitleFromInstruction(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return 'New App';
  }
  const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  const maxLength = 42;
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
}

export function deriveFileBaseNameFromInstruction(instruction: string, extension: string) {
  const fallback = fallbackBaseNameForExtension(extension);
  const trimmed = instruction.trim();
  if (!trimmed) {
    return fallback;
  }
  const firstLine = trimmed.split('\n').find((line) => line.trim().length > 0) ?? trimmed;
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  const replacedSlashes = collapsed.replaceAll('/', '-').replaceAll('\\', '-');
  const withoutControl = stripControlCharacters(replacedSlashes);
  const withoutReserved = withoutControl.replace(/[<>:"|?*]/g, '-');
  const maxLength = 42;
  const bounded =
    withoutReserved.length > maxLength ? withoutReserved.slice(0, maxLength).trim() : withoutReserved;
  return bounded.length > 0 ? bounded : fallback;
}

export function normalizeCreateNewExtension(extension: string) {
  const trimmed = extension.trim();
  if (!trimmed) {
    return '.app';
  }
  const withDot = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  return withDot.toLowerCase();
}

export function inferCreateNewExtension(instruction: string) {
  const normalized = instruction.trim().toLowerCase();
  if (!normalized) {
    return '.app';
  }

  if (normalized.includes('.svg') || /\bsvg\b/u.test(normalized) || normalized.includes('vector icon')) {
    return '.svg';
  }
  if (normalized.includes('slides') || normalized.includes('presentation') || normalized.includes('slide deck')) {
    return '.md';
  }
  if (normalized.includes('.md') || normalized.includes('markdown') || normalized.includes('readme')) {
    return '.md';
  }
  if (normalized.includes('.txt') || /\btext\b/u.test(normalized) || normalized.includes('plain text')) {
    return '.txt';
  }
  if (normalized.includes('.json') || /\bjson\b/u.test(normalized)) {
    return '.json';
  }
  if (normalized.includes('.html') || /\bhtml\b/u.test(normalized) || normalized.includes('web page')) {
    return '.html';
  }
  if (normalized.includes('.css') || /\bcss\b/u.test(normalized)) {
    return '.css';
  }
  if (normalized.includes('.csv') || /\bcsv\b/u.test(normalized)) {
    return '.csv';
  }

  if (
    normalized.includes('.app') ||
    /\bapp\b/u.test(normalized) ||
    normalized.includes('application') ||
    normalized.includes('dashboard') ||
    normalized.includes('tool')
  ) {
    return '.app';
  }

  return '.app';
}

export function normalizeCreateNewDirectory(directory: string) {
  const trimmed = directory.replaceAll('\\', '/').trim();
  if (!trimmed) {
    return '';
  }
  const withoutPrefix = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  const withoutLeadingSlash = withoutPrefix.replace(/^\/+/, '');
  const collapsed = withoutLeadingSlash.replace(/\/+/g, '/').trim();
  return collapsed.replace(/\/+$/g, '');
}

export function pickUniqueVirtualPath(input: {
  existingPaths: Set<string>;
  directory: string;
  baseName: string;
  extension: string;
}) {
  const directory = normalizeCreateNewDirectory(input.directory);
  const prefix = directory.length > 0 ? `${directory}/` : '';
  const extension = normalizeCreateNewExtension(input.extension);
  const baseName =
    input.baseName.trim().length > 0
      ? input.baseName.trim()
      : fallbackBaseNameForExtension(extension);

  const candidate = `${prefix}${baseName}${extension}`;
  if (!input.existingPaths.has(candidate)) {
    return candidate;
  }

  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const attempt = `${prefix}${baseName}-${String(suffix)}${extension}`;
    if (!input.existingPaths.has(attempt)) {
      return attempt;
    }
  }

  throw new Error('Unable to pick a unique file name.');
}

export function buildCreateNewFileContent(input: {
  instruction: string;
  extension: string;
  title: string;
}) {
  const extension = normalizeCreateNewExtension(input.extension);
  const normalizedInstruction = input.instruction.trim();
  const title = input.title.trim().length > 0 ? input.title.trim() : 'Untitled';

  if (extension === '.svg') {
    const safeComment = normalizedInstruction.replaceAll('--', '—').slice(0, 240);
    return [
      `<!-- ${title} -->`,
      safeComment ? `<!-- ${safeComment} -->` : null,
      '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="' +
        title.replaceAll('"', "'") +
        '">',
      '  <defs>',
      '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
      '      <stop offset="0" stop-color="#0f172a" />',
      '      <stop offset="1" stop-color="#1e293b" />',
      '    </linearGradient>',
      '  </defs>',
      '  <rect width="512" height="512" rx="96" fill="url(#bg)" />',
      '  <circle cx="256" cy="256" r="156" fill="#2563eb" opacity="0.95" />',
      '  <circle cx="208" cy="220" r="22" fill="#f8fafc" opacity="0.9" />',
      '  <circle cx="306" cy="282" r="14" fill="#f8fafc" opacity="0.85" />',
      '  <path d="M160 340c44 44 148 44 192 0" fill="none" stroke="#bfdbfe" stroke-width="18" stroke-linecap="round" />',
      '</svg>',
      ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (extension === '.md') {
    return [
      `# ${title}`,
      '',
      normalizedInstruction ? normalizedInstruction : 'Created by Aionios Create New.',
      ''
    ].join('\n');
  }

  if (extension === '.json') {
    return `${JSON.stringify(
      {
        title,
        description: normalizedInstruction || 'Created by Aionios Create New.'
      },
      null,
      2
    )}\n`;
  }

  if (extension === '.html') {
    const safeTitle = title.replaceAll('<', '').replaceAll('>', '');
    return [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      `    <title>${safeTitle}</title>`,
      '  </head>',
      '  <body>',
      `    <h1>${safeTitle}</h1>`,
      normalizedInstruction
        ? `    <p>${normalizedInstruction.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`
        : null,
      '  </body>',
      '</html>',
      ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  return `${normalizedInstruction || 'Created by Aionios Create New.'}\n`;
}
