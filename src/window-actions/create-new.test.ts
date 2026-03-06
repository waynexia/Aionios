import { describe, expect, it } from 'vitest';
import {
  buildCreateNewFileContent,
  deriveFileBaseNameFromInstruction,
  deriveWindowTitleFromInstruction,
  inferCreateNewExtension,
  normalizeCreateNewDirectory,
  normalizeCreateNewExtension,
  pickUniqueVirtualPath
} from './create-new';

describe('create-new helpers', () => {
  it('derives bounded window titles from instructions', () => {
    expect(deriveWindowTitleFromInstruction('')).toBe('New App');
    const title = deriveWindowTitleFromInstruction(
      '   Build   a kanban board with swimlanes and keyboard shortcuts   '
    );
    expect(title).toMatch(/^Build a kanban board with swimlanes/);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBe(42);
  });

  it('infers and normalizes file extensions', () => {
    expect(inferCreateNewExtension('make a markdown slide deck')).toBe('.md');
    expect(inferCreateNewExtension('create a plain text note')).toBe('.txt');
    expect(inferCreateNewExtension('vector icon for the app')).toBe('.svg');
    expect(inferCreateNewExtension('dashboard tool')).toBe('.app');
    expect(normalizeCreateNewExtension('JSON')).toBe('.json');
    expect(normalizeCreateNewExtension('')).toBe('.app');
  });

  it('normalizes create-new directories and picks unique paths', () => {
    expect(normalizeCreateNewDirectory('./notes//drafts/')).toBe('notes/drafts');
    expect(
      pickUniqueVirtualPath({
        existingPaths: new Set(['notes/drafts/New File.txt', 'notes/drafts/New File-2.txt']),
        directory: '/notes/drafts/',
        baseName: 'New File',
        extension: 'txt'
      })
    ).toBe('notes/drafts/New File-3.txt');
  });

  it('sanitizes derived base names', () => {
    expect(
      deriveFileBaseNameFromInstruction('  build <hello>/world:demo?*  ', '.txt')
    ).toBe('build -hello--world-demo--');
    expect(deriveFileBaseNameFromInstruction('', '.json')).toBe('data');
  });

  it('builds file templates for structured file types', () => {
    const svg = buildCreateNewFileContent({
      instruction: 'A glossy icon',
      extension: '.svg',
      title: 'Logo'
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<!-- Logo -->');

    const markdown = buildCreateNewFileContent({
      instruction: 'Presentation outline',
      extension: '.md',
      title: 'Deck'
    });
    expect(markdown).toContain('# Deck');
    expect(markdown).toContain('Presentation outline');

    const html = buildCreateNewFileContent({
      instruction: 'Show <b>safe</b> copy',
      extension: '.html',
      title: 'Landing'
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;b&gt;safe&lt;/b&gt;');
  });
});
