import { describe, expect, it } from 'vitest';
import {
  buildEmojiStrip,
  createEmojiReels,
  getRandomEmoji,
  isEmojiCodePointInRange
} from './emoji-random';

function createSequenceRandom(sequence: number[]) {
  let index = 0;
  return () => {
    const value = sequence[index] ?? sequence.at(-1) ?? 0;
    index += 1;
    return value;
  };
}

describe('emoji-random', () => {
  it('samples emoji characters from configured Unicode ranges', () => {
    const random = createSequenceRandom([
      0.02, 0.14, 0.27, 0.39, 0.52, 0.64, 0.77, 0.91
    ]);

    for (let index = 0; index < 8; index += 1) {
      const emoji = getRandomEmoji(random);
      const codePoint = emoji.codePointAt(0);

      expect(emoji).toMatch(/^\p{Extended_Pictographic}$/u);
      expect(codePoint).toBeTypeOf('number');
      expect(isEmojiCodePointInRange(codePoint ?? -1)).toBe(true);
    }
  });

  it('builds slow-slot reels with randomized timing metadata', () => {
    const random = createSequenceRandom([
      0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88, 0.96
    ]);
    const reels = createEmojiReels(3, 6, random);

    expect(reels).toHaveLength(3);
    expect(reels.every((reel) => reel.items.length === 6)).toBe(true);
    expect(reels.every((reel) => reel.durationMs >= 16000)).toBe(true);
    expect(reels.every((reel) => reel.delayMs <= 0)).toBe(true);
    expect(
      reels.every((reel) =>
        reel.items.every((emoji) => /^\p{Extended_Pictographic}$/u.test(emoji))
      )
    ).toBe(true);
  });

  it('clamps invalid strip lengths to a usable minimum', () => {
    expect(buildEmojiStrip(0)).toHaveLength(1);
  });
});
