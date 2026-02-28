import type { DesktopWindow } from '../types';

interface TaskbarProps {
  windows: DesktopWindow[];
  focusedWindowId?: string;
  onWindowClick: (windowId: string) => void;
}

export function Taskbar({ windows, focusedWindowId, onWindowClick }: TaskbarProps) {
  return (
    <footer className="taskbar">
      <div className="taskbar__start">Aionios</div>
      <div className="taskbar__windows">
        {windows.map((windowItem) => (
          <button
            key={windowItem.windowId}
            className={`taskbar__window ${
              windowItem.windowId === focusedWindowId ? 'taskbar__window--active' : ''
            }`}
            onClick={() => onWindowClick(windowItem.windowId)}
          >
            <span>{windowItem.title}</span>
            <span className="taskbar__status">{windowItem.status}</span>
          </button>
        ))}
      </div>
    </footer>
  );
}
