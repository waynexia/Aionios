import { useEffect, useState } from 'react';

function formatTwoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function formatClockTime(now: Date) {
  return `${formatTwoDigits(now.getHours())}:${formatTwoDigits(now.getMinutes())}`;
}

interface MobileStatusBarProps {
  surface: 'home' | 'app' | 'recents';
}

export function MobileStatusBar({ surface }: MobileStatusBarProps) {
  const [now, setNow] = useState(() => new Date());
  const surfaceLabel =
    surface === 'home' ? 'Desk' : surface === 'recents' ? 'Switchboard' : 'Live Window';

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="mobile-status-bar" data-mobile-status-bar data-mobile-surface={surface}>
      <div className="mobile-status-bar__identity">
        <time className="mobile-status-bar__time" dateTime={now.toISOString()}>
          {formatClockTime(now)}
        </time>
        <span className="mobile-status-bar__surface">{surfaceLabel}</span>
      </div>
      <div className="mobile-status-bar__indicators" aria-hidden="true">
        <span className="mobile-status-bar__network">
          <span />
          <span />
          <span />
        </span>
        <span className="mobile-status-bar__wifi" />
        <span className="mobile-status-bar__battery">
          <span className="mobile-status-bar__battery-level" />
        </span>
      </div>
    </header>
  );
}
