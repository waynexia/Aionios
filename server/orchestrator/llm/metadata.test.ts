import { describe, expect, it } from 'vitest';
import {
  buildFallbackArtifactMetadata,
  parseArtifactMetadataResponse
} from './metadata';

describe('artifact metadata helpers', () => {
  it('parses strict JSON metadata responses and preserves the expected extension', () => {
    const parsed = parseArtifactMetadataResponse(
      '{"emoji":"🧠","title":"Focus Board","fileName":"focus-board.app"}',
      {
        kind: 'app',
        instruction: 'Build a focus dashboard app',
        extension: '.app'
      },
      'codex'
    );

    expect(parsed).toMatchObject({
      emoji: '🧠',
      title: 'Focus Board',
      fileName: 'focus-board.app',
      backend: 'codex'
    });
  });

  it('falls back to sanitized defaults when the response is invalid', () => {
    const fallback = buildFallbackArtifactMetadata({
      kind: 'file',
      instruction: 'Create a markdown project brief',
      extension: '.md'
    });
    const parsed = parseArtifactMetadataResponse(
      'not json at all',
      {
        kind: 'file',
        instruction: 'Create a markdown project brief',
        extension: '.md'
      },
      'codex'
    );

    expect(parsed.title).toBe(fallback.title);
    expect(parsed.fileName.endsWith('.md')).toBe(true);
    expect(parsed.emoji).toMatch(/^\p{Extended_Pictographic}$/u);
    expect(parsed.backend).toBe('codex');
  });
});
