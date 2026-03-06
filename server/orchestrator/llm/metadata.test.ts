import { describe, expect, it } from 'vitest';
import {
  buildFallbackArtifactMetadata,
  parseArtifactMetadataResponse
} from './metadata';

function countNameWords(value: string, extension: string) {
  const baseName = value.toLowerCase().endsWith(extension) ? value.slice(0, -extension.length) : value;
  return baseName.split('-').filter(Boolean).length;
}

describe('artifact metadata helpers', () => {
  it('normalizes parsed metadata to one shared short name', () => {
    const parsed = parseArtifactMetadataResponse(
      '{"emoji":"🧠","title":"Focus Board","fileName":"focus board.app"}',
      {
        kind: 'app',
        instruction: 'Build a focus dashboard app',
        extension: '.app'
      },
      'codex'
    );

    expect(parsed).toMatchObject({
      emoji: '🧠',
      title: 'Focus-Board.app',
      fileName: 'Focus-Board.app',
      backend: 'codex'
    });
    expect(parsed.title).toBe(parsed.fileName);
    expect(parsed.fileName.includes(' ')).toBe(false);
    expect(countNameWords(parsed.fileName, '.app')).toBeLessThanOrEqual(3);
  });

  it('uses the parsed title when fileName is missing but still keeps one shared short name', () => {
    const parsed = parseArtifactMetadataResponse(
      '{"emoji":"📚","title":"Reading sprint planner"}',
      {
        kind: 'app',
        instruction: 'Build an app for reading sprints and session tracking',
        extension: '.app'
      },
      'codex'
    );

    expect(parsed).toMatchObject({
      emoji: '📚',
      title: 'Reading-Sprint-Planner.app',
      fileName: 'Reading-Sprint-Planner.app',
      backend: 'codex'
    });
    expect(parsed.title).toBe(parsed.fileName);
    expect(parsed.fileName.includes(' ')).toBe(false);
    expect(countNameWords(parsed.fileName, '.app')).toBeLessThanOrEqual(3);
  });

  it('falls back to one shared short name when the response is invalid', () => {
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
    expect(parsed.fileName).toBe(fallback.fileName);
    expect(parsed.title).toBe(parsed.fileName);
    expect(parsed.fileName.endsWith('.md')).toBe(true);
    expect(parsed.fileName.includes(' ')).toBe(false);
    expect(countNameWords(parsed.fileName, '.md')).toBeLessThanOrEqual(3);
    expect(parsed.emoji).toMatch(/^\p{Extended_Pictographic}$/u);
    expect(parsed.backend).toBe('codex');
  });
});
