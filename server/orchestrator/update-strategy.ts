import type { UpdateStrategy } from './types';

export function pickUpdateStrategy(
  previousSource: string | undefined,
  nextSource: string
): UpdateStrategy {
  if (!previousSource) {
    return 'remount';
  }

  const importPattern = /import[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  const currentImports = Array.from(previousSource.matchAll(importPattern))
    .map((entry) => entry[1])
    .sort();
  const nextImports = Array.from(nextSource.matchAll(importPattern))
    .map((entry) => entry[1])
    .sort();
  if (currentImports.join(',') !== nextImports.join(',')) {
    return 'remount';
  }

  const hasDefaultWindowExport =
    /export\s+default\s+function\s+WindowApp\b/.test(previousSource) &&
    /export\s+default\s+function\s+WindowApp\b/.test(nextSource);
  return hasDefaultWindowExport ? 'hmr' : 'remount';
}
