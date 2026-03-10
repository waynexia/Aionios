import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { DesktopWindow } from '../types';

const DISMISS_THRESHOLD_PX = 108;
const DRAG_THRESHOLD_PX = 8;

interface DragState {
  windowId: string;
  pointerId: number;
  startX: number;
  offsetX: number;
  moved: boolean;
}

interface MobileTaskSwitcherProps {
  windows: DesktopWindow[];
  activeWindowId?: string | null;
  getWindowIcon: (windowItem: DesktopWindow) => string;
  onSelectWindow: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
}

export function MobileTaskSwitcher({
  windows,
  activeWindowId,
  getWindowIcon,
  onSelectWindow,
  onCloseWindow
}: MobileTaskSwitcherProps) {
  const dragStateRef = useRef<DragState | null>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [suppressedWindowId, setSuppressedWindowId] = useState<string | null>(null);

  useEffect(() => {
    setOffsets((current) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const windowItem of windows) {
        if (current[windowItem.windowId]) {
          next[windowItem.windowId] = current[windowItem.windowId];
        }
      }
      if (Object.keys(next).length !== Object.keys(current).length) {
        changed = true;
      }
      return changed ? next : current;
    });
  }, [windows]);

  const onCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    windowId: string
  ) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      windowId,
      pointerId: event.pointerId,
      startX: event.clientX,
      offsetX: offsets[windowId] ?? 0,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCardPointerMove = (
    event: ReactPointerEvent<HTMLElement>,
    windowId: string
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.windowId !== windowId || dragState.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(deltaX) >= DRAG_THRESHOLD_PX) {
      dragState.moved = true;
      setSuppressedWindowId(windowId);
    }
    if (!dragState.moved) {
      return;
    }
    event.preventDefault();
    setOffsets((current) => ({
      ...current,
      [windowId]: dragState.offsetX + deltaX
    }));
  };

  const onCardPointerEnd = (
    event: ReactPointerEvent<HTMLElement>,
    windowId: string
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.windowId !== windowId || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    const offsetX = dragState.offsetX + (event.clientX - dragState.startX);
    if (Math.abs(offsetX) >= DISMISS_THRESHOLD_PX) {
      setOffsets((current) => {
        const next = { ...current };
        delete next[windowId];
        return next;
      });
      onCloseWindow(windowId);
      window.setTimeout(() => {
        setSuppressedWindowId((current) => (current === windowId ? null : current));
      }, 120);
      return;
    }
    setOffsets((current) => ({
      ...current,
      [windowId]: 0
    }));
    if (!dragState.moved && event.pointerType !== 'mouse') {
      onSelectWindow(windowId);
    }
    window.setTimeout(() => {
      setSuppressedWindowId((current) => (current === windowId ? null : current));
    }, 120);
  };

  return (
    <section className="mobile-task-switcher" data-mobile-task-switcher>
      <header className="mobile-task-switcher__header">
        <strong>Recent Tasks</strong>
        <span>{windows.length} active</span>
      </header>
      <div className="mobile-task-switcher__list">
        {windows.map((windowItem) => {
          const offsetX = offsets[windowItem.windowId] ?? 0;
          const isActive = windowItem.windowId === activeWindowId;
          return (
            <article
              key={windowItem.windowId}
              className={`mobile-task-card${isActive ? ' mobile-task-card--active' : ''}`}
              data-mobile-task-card={windowItem.windowId}
              style={{
                transform: `translateX(${Math.round(offsetX)}px) rotate(${offsetX / 28}deg)`,
                opacity: Math.max(0.28, 1 - Math.min(0.72, Math.abs(offsetX) / 220))
              }}
              onPointerDown={(event) => onCardPointerDown(event, windowItem.windowId)}
              onPointerMove={(event) => onCardPointerMove(event, windowItem.windowId)}
              onPointerUp={(event) => onCardPointerEnd(event, windowItem.windowId)}
              onPointerCancel={(event) => onCardPointerEnd(event, windowItem.windowId)}
              onClick={() => {
                if (suppressedWindowId === windowItem.windowId) {
                  return;
                }
                onSelectWindow(windowItem.windowId);
              }}
            >
              <div className="mobile-task-card__preview" aria-hidden="true">
                <span className="mobile-task-card__icon">{getWindowIcon(windowItem)}</span>
                <span className="mobile-task-card__status">{windowItem.status}</span>
              </div>
              <div className="mobile-task-card__meta">
                <strong>{windowItem.title}</strong>
                <span>
                  {windowItem.appId} · rev {windowItem.revision}
                </span>
              </div>
              <button
                type="button"
                className="mobile-task-card__close"
                data-mobile-task-close={windowItem.windowId}
                aria-label={`Close ${windowItem.title}`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseWindow(windowItem.windowId);
                }}
              >
                ×
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
