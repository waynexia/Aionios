import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createEmojiReels, getRandomEmoji } from '../utils/emoji-random';

const SELECTION_TICK_MS = 1600;

export interface LlmGenerationExperienceProps {
  title: string;
  phase: 'loading' | 'completing';
}

export function LlmGenerationExperience({
  title,
  phase
}: LlmGenerationExperienceProps) {
  const reels = useMemo(() => createEmojiReels(5, 12), []);
  const [selectionEmoji, setSelectionEmoji] = useState(() => getRandomEmoji());

  useEffect(() => {
    if (phase !== 'loading') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSelectionEmoji(getRandomEmoji());
    }, SELECTION_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase]);

  const targetTitle = title.trim() || 'this window';
  const titleLabel =
    phase === 'loading'
      ? `Choosing an emoji for ${targetTitle}`
      : `Finalizing ${targetTitle}`;
  const statusLabel =
    phase === 'loading' ? 'Scanning Unicode emoji ranges' : 'Selection locked';

  return (
    <section
      className={`llm-generation llm-generation--${phase}`}
      data-llm-generation
      data-llm-generation-phase={phase}
      role="status"
      aria-live="polite"
      aria-label={titleLabel}
    >
      <div className="llm-generation__ambient" aria-hidden="true">
        <div className="llm-generation__ambient-orb llm-generation__ambient-orb--left" />
        <div className="llm-generation__ambient-orb llm-generation__ambient-orb--right" />
      </div>

      <div className="llm-generation__panel">
        <header className="llm-generation__header">
          <span className="llm-generation__eyebrow">LLM Generation</span>
          <strong className="llm-generation__title">{titleLabel}</strong>
          <p className="llm-generation__copy">
            Slow reels keep motion readable during longer generation runs.
          </p>
        </header>

        <div className="llm-generation__machine" aria-hidden="true">
          <div className="llm-generation__spotlight" />
          <div className="llm-generation__focus-band" />

          <div className="llm-generation__reels">
            {reels.map((reel, index) => {
              const style = {
                '--llm-generation-reel-duration': `${reel.durationMs}ms`,
                '--llm-generation-reel-delay': `${reel.delayMs}ms`
              } as CSSProperties;

              return (
                <div
                  key={`reel-${index}`}
                  className="llm-generation__reel"
                  style={style}
                >
                  <div className="llm-generation__strip">
                    {[...reel.items, ...reel.items].map((emoji, emojiIndex) => (
                      <span
                        key={`${emoji}-${emojiIndex}`}
                        className="llm-generation__symbol"
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="llm-generation__selection" data-llm-generation-selection>
            <span className="llm-generation__selection-emoji">{selectionEmoji}</span>
            <span className="llm-generation__selection-label">{statusLabel}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
