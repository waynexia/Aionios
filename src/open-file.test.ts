import { describe, expect, it } from 'vitest';
import {
  APP_DESCRIPTOR_EXTENSION,
  buildFileOpenWindowTitle,
  isMediaFilePath,
  parseAioniosAppDescriptor
} from './open-file';

describe('open-file helpers', () => {
  it('parses valid aionios app descriptors', () => {
    const descriptor = {
      kind: 'aionios.app',
      version: 1,
      appId: 'app-123',
      title: 'My App',
      icon: '🧩',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const parsed = parseAioniosAppDescriptor(JSON.stringify(descriptor));
    expect(parsed).toEqual({
      appId: 'app-123',
      title: 'My App',
      icon: '🧩'
    });
  });

  it('rejects non-descriptor JSON', () => {
    const parsed = parseAioniosAppDescriptor(JSON.stringify({ kind: 'nope', version: 1 }));
    expect(parsed).toBeNull();
  });

  it('detects media file paths by extension', () => {
    expect(isMediaFilePath('photos/cat.png')).toBe(true);
    expect(isMediaFilePath('videos/demo.mp4')).toBe(true);
    expect(isMediaFilePath('audio/song.mp3')).toBe(true);
    expect(isMediaFilePath('notes/readme.md')).toBe(false);
  });

  it('builds a bounded title for file opens', () => {
    const title = buildFileOpenWindowTitle({
      appTitle: 'Editor',
      path: `notes/${'x'.repeat(200)}.md`
    });
    expect(title).toContain('— Editor');
    expect(title.length).toBeLessThanOrEqual(52);
  });

  it('keeps the descriptor extension stable', () => {
    expect(APP_DESCRIPTOR_EXTENSION).toBe('.aionios-app.json');
  });
});

