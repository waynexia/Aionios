const PREVIOUS_SOURCE_START_MARKER = 'Previous module source:';
const PROMPT_END_MARKER = 'Return only TSX module code.';
const FIRST_RENDER_MARKER = 'No previous source exists yet (first render).';
const USER_INSTRUCTION_START_MARKER = 'User instruction for this update:';
const RECENT_CONTEXT_MARKER = '\nRecent context:';

export function redactPreviousSource(prompt: string) {
  const startIndex = prompt.indexOf(PREVIOUS_SOURCE_START_MARKER);
  if (startIndex === -1) {
    return prompt;
  }
  const endIndex = prompt.indexOf(PROMPT_END_MARKER, startIndex);
  const redacted = `${PREVIOUS_SOURCE_START_MARKER}\n[redacted]\n\n`;
  if (endIndex === -1) {
    return `${prompt.slice(0, startIndex)}${redacted}`.trimEnd();
  }
  return `${prompt.slice(0, startIndex)}${redacted}${prompt.slice(endIndex)}`.trimEnd();
}

export function extractUserInstructionFromPrompt(prompt: string) {
  const startIndex = prompt.indexOf(USER_INSTRUCTION_START_MARKER);
  if (startIndex === -1) {
    return undefined;
  }
  let contentStart = startIndex + USER_INSTRUCTION_START_MARKER.length;
  if (prompt[contentStart] === '\r' && prompt[contentStart + 1] === '\n') {
    contentStart += 2;
  } else if (prompt[contentStart] === '\n') {
    contentStart += 1;
  }
  const endIndex = prompt.indexOf(RECENT_CONTEXT_MARKER, contentStart);
  const content = endIndex === -1 ? prompt.slice(contentStart) : prompt.slice(contentStart, endIndex);
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function hydrateRedactedPreviousSource(prompt: string, previousSource: string | undefined) {
  if (!previousSource) {
    return prompt;
  }
  const startIndex = prompt.indexOf(PREVIOUS_SOURCE_START_MARKER);
  if (startIndex === -1) {
    const firstRenderIndex = prompt.indexOf(FIRST_RENDER_MARKER);
    if (firstRenderIndex === -1) {
      return prompt;
    }
    const hydrated = `${PREVIOUS_SOURCE_START_MARKER}\n${previousSource}\n\n`;
    return `${prompt.slice(0, firstRenderIndex)}${hydrated}${prompt.slice(
      firstRenderIndex + FIRST_RENDER_MARKER.length
    )}`.trimEnd();
  }
  const endIndex = prompt.indexOf(PROMPT_END_MARKER, startIndex);
  if (endIndex === -1) {
    return prompt;
  }
  const section = prompt.slice(startIndex, endIndex);
  if (!section.includes('[redacted]')) {
    return prompt;
  }
  const hydrated = `${PREVIOUS_SOURCE_START_MARKER}\n${previousSource}\n\n`;
  return `${prompt.slice(0, startIndex)}${hydrated}${prompt.slice(endIndex)}`.trimEnd();
}
