import type { DesktopWindow } from '../types';
import { useEffect, useState } from 'react';

interface TaskbarProps {
  windows: DesktopWindow[];
  focusedWindowId?: string;
  onStartClick: () => void;
  onWindowClick: (windowId: string) => void;
}

function formatTwoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function formatClockTime(now: Date) {
  return `${formatTwoDigits(now.getHours())}:${formatTwoDigits(now.getMinutes())}:${formatTwoDigits(
    now.getSeconds()
  )}`;
}

function formatClockDate(now: Date) {
  return `${now.getFullYear()}/${formatTwoDigits(now.getMonth() + 1)}/${formatTwoDigits(now.getDate())}`;
}

function TaskbarClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="taskbar__clock" data-taskbar-clock>
      <time className="taskbar__clock-time" data-taskbar-time dateTime={now.toISOString()}>
        {formatClockTime(now)}
      </time>
      <time className="taskbar__clock-date" data-taskbar-date dateTime={now.toISOString()}>
        {formatClockDate(now)}
      </time>
    </div>
  );
}

export function Taskbar({ windows, focusedWindowId, onStartClick, onWindowClick }: TaskbarProps) {
  return (
    <footer className="taskbar">
      <button
        type="button"
        className="taskbar__start"
        data-taskbar-start
        aria-label="Quick create"
        onClick={() => {
          onStartClick();
        }}
      >
        <img className="taskbar__start-icon" src="/icons/icon-white-48x48.png" alt="" />
        <span>Aionios</span>
      </button>
      <div className="taskbar__windows">
        {windows.map((windowItem) => (
          <button
            key={windowItem.windowId}
            className={`taskbar__window ${
              windowItem.windowId === focusedWindowId ? 'taskbar__window--active' : ''
            }`}
            data-window-id={windowItem.windowId}
            data-app-id={windowItem.appId}
            onClick={() => onWindowClick(windowItem.windowId)}
          >
            <span>{windowItem.title}</span>
            <span className="taskbar__status" data-taskbar-status>
              {windowItem.status}
            </span>
          </button>
        ))}
      </div>
      <TaskbarClock />
    </footer>
  );
}
