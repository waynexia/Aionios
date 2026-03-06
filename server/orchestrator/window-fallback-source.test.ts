import { describe, expect, it } from 'vitest';
import { buildWindowFallbackSource } from './window-fallback-source';

describe('buildWindowFallbackSource', () => {
  it('builds a not-found fallback', () => {
    const snapshot = buildWindowFallbackSource();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.source).toContain('Window not found.');
    expect(snapshot.source).toContain('#f8fafc');
  });

  it('builds an error fallback', () => {
    const snapshot = buildWindowFallbackSource({
      status: 'error',
      error: 'compile failed'
    });
    expect(snapshot.source).toContain('Generation failed: compile failed');
    expect(snapshot.source).toContain('#fecaca');
  });

  it('builds a loading fallback for non-error records', () => {
    const snapshot = buildWindowFallbackSource({
      status: 'loading',
      error: undefined
    });
    expect(snapshot.source).toContain('Generating window module');
    expect(snapshot.source).toContain('#cbd5e1');
  });
});
