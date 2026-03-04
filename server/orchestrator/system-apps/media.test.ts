import { describe, expect, it } from 'vitest';
import { MEDIA_WINDOW_SOURCE } from './media';

describe('MEDIA_WINDOW_SOURCE', () => {
  it('contains WindowApp export and required test hooks', () => {
    expect(MEDIA_WINDOW_SOURCE).toContain('export default function WindowApp');
    expect(MEDIA_WINDOW_SOURCE).toContain('data-media-app');
    expect(MEDIA_WINDOW_SOURCE).toContain('data-media-source');
    expect(MEDIA_WINDOW_SOURCE).toContain('data-media-load');
    expect(MEDIA_WINDOW_SOURCE).toContain('data-media-player');
  });

  it('uses host file APIs and renders media players', () => {
    expect(MEDIA_WINDOW_SOURCE).toContain('.listFiles()');
    expect(MEDIA_WINDOW_SOURCE).toContain('host.readFile');
    expect(MEDIA_WINDOW_SOURCE).toContain('windowState.launch');
    expect(MEDIA_WINDOW_SOURCE).toContain('<img');
    expect(MEDIA_WINDOW_SOURCE).toContain('<audio');
    expect(MEDIA_WINDOW_SOURCE).toContain('<video');
  });
});
