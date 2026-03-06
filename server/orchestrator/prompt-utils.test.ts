import { describe, expect, it } from 'vitest';
import {
  extractUserInstructionFromPrompt,
  hydrateRedactedPreviousSource,
  redactPreviousSource
} from './prompt-utils';

describe('prompt utils', () => {
  it('redacts previous source from stored prompts', () => {
    const prompt = [
      'You are generating one React TSX module for a desktop window runtime.',
      'Previous module source:',
      "export default function WindowApp() { return <div>Ready</div>; }",
      '',
      'Return only TSX module code.'
    ].join('\n');

    const redacted = redactPreviousSource(prompt);

    expect(redacted).toContain('Previous module source:');
    expect(redacted).toContain('[redacted]');
    expect(redacted).not.toContain('Ready');
  });

  it('extracts the user instruction from prompts', () => {
    const prompt = [
      'You are generating one React TSX module for a desktop window runtime.',
      'User instruction for this update:',
      'Add a chart and keyboard shortcuts.',
      'Recent context:',
      '[user] previous message'
    ].join('\n');

    expect(extractUserInstructionFromPrompt(prompt)).toBe(
      'Add a chart and keyboard shortcuts.'
    );
    expect(extractUserInstructionFromPrompt('Recent context:\n[user] none')).toBeUndefined();
  });

  it('hydrates redacted previous source sections', () => {
    const redactedPrompt = [
      'User instruction for this update:',
      'Refine layout',
      'Previous module source:',
      '[redacted]',
      '',
      'Return only TSX module code.'
    ].join('\n');

    const hydrated = hydrateRedactedPreviousSource(
      redactedPrompt,
      "export default function WindowApp() { return <div>Ready</div>; }"
    );

    expect(hydrated).toContain('Ready');
    expect(hydrated).not.toContain('[redacted]');
  });

  it('hydrates first-render prompts when previous source becomes available', () => {
    const firstRenderPrompt = [
      'User instruction for this update:',
      'Refine layout',
      'No previous source exists yet (first render).',
      '',
      'Return only TSX module code.'
    ].join('\n');

    const hydrated = hydrateRedactedPreviousSource(
      firstRenderPrompt,
      "export default function WindowApp() { return <div>Ready</div>; }"
    );

    expect(hydrated).toContain('Previous module source:');
    expect(hydrated).toContain('Ready');
    expect(hydrated).not.toContain('No previous source exists yet');
  });
});
