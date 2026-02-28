import type { ReactNode } from 'react';
import type { DesktopWindow } from '../types';

interface WindowFrameProps {
  windowItem: DesktopWindow;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  children: ReactNode;
}

export function WindowFrame({
  windowItem,
  focused,
  onFocus,
  onClose,
  onMinimize,
  children
}: WindowFrameProps) {
  return (
    <article
      className={`window-frame ${focused ? 'window-frame--focused' : ''}`}
      style={{ zIndex: windowItem.zIndex }}
      data-session-id={windowItem.sessionId}
      data-window-id={windowItem.windowId}
      data-app-id={windowItem.appId}
      onMouseDown={onFocus}
    >
      <header className="window-frame__header">
        <div className="window-frame__title">
          <span>{windowItem.title}</span>
          <small>
            {windowItem.appId} · rev {windowItem.revision}
          </small>
        </div>
        <div className="window-frame__actions">
          <button onClick={onMinimize} aria-label="Minimize window">
            _
          </button>
          <button onClick={onClose} aria-label="Close window">
            ×
          </button>
        </div>
      </header>
      <section className="window-frame__content">{children}</section>
    </article>
  );
}
