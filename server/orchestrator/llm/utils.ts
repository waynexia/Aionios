export function unwrapCodeBlock(content: string): string {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}
