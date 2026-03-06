import type { SourceSnapshot, WindowRecord } from './types';

function buildFallbackModuleSource(message: string, color: string) {
  return `
import React from 'react';
export default function WindowApp() {
  return <div style={{ padding: 16, color: '${color}' }}>${JSON.stringify(message)}</div>;
}
`.trim();
}

export function buildWindowFallbackSource(
  record?: Pick<WindowRecord, 'status' | 'error'>
): SourceSnapshot {
  if (!record) {
    return {
      revision: 0,
      source: buildFallbackModuleSource('Window not found.', '#f8fafc')
    };
  }

  if (record.status === 'error') {
    return {
      revision: 0,
      source: buildFallbackModuleSource(
        `Generation failed: ${record.error ?? 'Unknown error'}`,
        '#fecaca'
      )
    };
  }

  return {
    revision: 0,
    source: buildFallbackModuleSource('Generating window module…', '#cbd5e1')
  };
}
