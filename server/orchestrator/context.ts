import type { ContextEntry, GenerateRequest } from './types';

export function createContextEntry(role: ContextEntry['role'], content: string): ContextEntry {
  return {
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

function summarizeContext(context: ContextEntry[]): string {
  if (context.length === 0) {
    return 'No prior interaction yet.';
  }
  return context
    .slice(-12)
    .map((entry) => `[${entry.role}] ${entry.content}`)
    .join('\n');
}

export function buildGenerationPrompt(request: GenerateRequest): string {
  const contextSummary = summarizeContext(request.context);
  const instruction = request.instruction
    ? `User instruction for this update:\n${request.instruction}\n`
    : 'No direct user instruction for this generation.\n';
  const previousSource = request.previousSource
    ? `Previous module source:\n${request.previousSource}\n`
    : 'No previous source exists yet (first render).\n';
  return [
    'You are generating one React TSX module for a desktop window runtime.',
    'Hard constraints:',
    '1) Must export default React component named WindowApp (function).',
    "2) Only import from 'react'.",
    '3) No external side effects, no global mutation.',
    '4) Use props signature: ({ host, windowState }).',
    '5) Keep code self-contained.',
    '',
    `Session: ${request.sessionId}`,
    `Window: ${request.windowId}`,
    `App: ${request.appId}`,
    `Title: ${request.title}`,
    `Reason: ${request.reason}`,
    '',
    instruction,
    'Recent context:',
    contextSummary,
    '',
    previousSource,
    '',
    'Return only TSX module code.'
  ].join('\n');
}
