import { describe, expect, it } from 'vitest';
import { EDITOR_WINDOW_SOURCE } from './editor';

describe('EDITOR_WINDOW_SOURCE', () => {
  it('provides a default WindowApp module', () => {
    expect(EDITOR_WINDOW_SOURCE).toContain('export default function WindowApp');
  });

  it('uses host file APIs for file browsing and persistence', () => {
    expect(EDITOR_WINDOW_SOURCE).toContain('host.listFiles');
    expect(EDITOR_WINDOW_SOURCE).toContain('host.readFile');
    expect(EDITOR_WINDOW_SOURCE).toContain('host.writeFile');
  });

  it('includes required test hooks', () => {
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-app');
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-files');
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-selected');
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-textarea');
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-save');
    expect(EDITOR_WINDOW_SOURCE).toContain('data-editor-preview');
  });

  it('uses shiki for syntax-highlighted preview rendering', () => {
    expect(EDITOR_WINDOW_SOURCE).toContain("import('shiki/bundle/web')");
    expect(EDITOR_WINDOW_SOURCE).toContain('codeToHtml');
    expect(EDITOR_WINDOW_SOURCE).toContain('dangerouslySetInnerHTML');
  });
});
