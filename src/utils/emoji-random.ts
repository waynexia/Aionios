export const EMOJI_CODEPOINT_RANGES = [
  [0x2600, 0x27bf],
  [0x1f300, 0x1f5ff],
  [0x1f600, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff]
] as const;

const EXTENDED_PICTOGRAPHIC_PATTERN = /^\p{Extended_Pictographic}$/u;

const TOTAL_CODEPOINT_SPAN = EMOJI_CODEPOINT_RANGES.reduce(
  (total, [start, end]) => total + (end - start + 1),
  0
);

function clampCount(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function isRenderableEmoji(character: string) {
  return EXTENDED_PICTOGRAPHIC_PATTERN.test(character);
}

export function isEmojiCodePointInRange(codePoint: number) {
  return EMOJI_CODEPOINT_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end
  );
}

export function sampleEmojiCodePoint(random: () => number = Math.random): number {
  let offset = Math.floor(random() * TOTAL_CODEPOINT_SPAN);

  for (const [start, end] of EMOJI_CODEPOINT_RANGES) {
    const span = end - start + 1;
    if (offset < span) {
      return start + offset;
    }
    offset -= span;
  }

  const [, fallbackEnd] = EMOJI_CODEPOINT_RANGES.at(-1) ?? [0x2600, 0x27bf];
  return fallbackEnd;
}

export function getRandomEmoji(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidate = String.fromCodePoint(sampleEmojiCodePoint(random));
    if (isRenderableEmoji(candidate)) {
      return candidate;
    }
  }

  return String.fromCodePoint(0x2600);
}

export function buildEmojiStrip(length: number, random: () => number = Math.random): string[] {
  return Array.from({ length: clampCount(length) }, () => getRandomEmoji(random));
}

export interface EmojiReel {
  items: string[];
  durationMs: number;
  delayMs: number;
}

export function createEmojiReels(
  reelCount: number,
  stripLength: number,
  random: () => number = Math.random
): EmojiReel[] {
  const safeReelCount = clampCount(reelCount);

  return Array.from({ length: safeReelCount }, (_, index) => ({
    items: buildEmojiStrip(stripLength, random),
    durationMs: 16000 + Math.floor(random() * 7000) + index * 850,
    delayMs: -Math.floor(random() * 4000)
  }));
}
