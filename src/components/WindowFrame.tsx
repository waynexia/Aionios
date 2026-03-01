import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useRef } from 'react';
import type { DesktopWindow, WindowBounds } from '../types';

const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 240;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

interface WindowFrameProps {
  windowItem: DesktopWindow;
  showRevision?: boolean;
  focused: boolean;
  onFocus: () => void;
  onBoundsChange: (bounds: WindowBounds) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  onMinimize: () => void;
  children: ReactNode;
}

export function WindowFrame({
  windowItem,
  showRevision = true,
  focused,
  onFocus,
  onBoundsChange,
  onToggleMaximize,
  onClose,
  onMinimize,
  children
}: WindowFrameProps) {
  const frameRef = useRef<HTMLElement | null>(null);

  const startInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
    direction?: ResizeDirection
  ) => {
    if (event.button !== 0) {
      return;
    }
    onFocus();
    if (windowItem.maximized) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const frameElement = frameRef.current;
    const canvasElement = frameElement?.parentElement;
    if (!frameElement || !canvasElement) {
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const canvasWidth = Math.max(0, canvasRect.width);
    const canvasHeight = Math.max(0, canvasRect.height);
    const minWidth = Math.max(120, Math.min(MIN_WINDOW_WIDTH, canvasWidth));
    const minHeight = Math.max(120, Math.min(MIN_WINDOW_HEIGHT, canvasHeight));
    const startBounds: WindowBounds = {
      x: windowItem.x,
      y: windowItem.y,
      width: windowItem.width,
      height: windowItem.height
    };
    let lastBounds = startBounds;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      let nextBounds = startBounds;
      if (mode === 'move') {
        const maxX = Math.max(0, canvasWidth - startBounds.width);
        const maxY = Math.max(0, canvasHeight - startBounds.height);
        nextBounds = {
          x: Math.round(clamp(startBounds.x + deltaX, 0, maxX)),
          y: Math.round(clamp(startBounds.y + deltaY, 0, maxY)),
          width: startBounds.width,
          height: startBounds.height
        };
      } else if (direction) {
        const startLeft = startBounds.x;
        const startTop = startBounds.y;
        const startRight = startBounds.x + startBounds.width;
        const startBottom = startBounds.y + startBounds.height;
        let left = startLeft;
        let top = startTop;
        let right = startRight;
        let bottom = startBottom;

        if (direction.includes('e')) {
          right = clamp(startRight + deltaX, startLeft + minWidth, canvasWidth);
        }
        if (direction.includes('s')) {
          bottom = clamp(startBottom + deltaY, startTop + minHeight, canvasHeight);
        }
        if (direction.includes('w')) {
          left = clamp(startLeft + deltaX, 0, right - minWidth);
        }
        if (direction.includes('n')) {
          top = clamp(startTop + deltaY, 0, bottom - minHeight);
        }

        nextBounds = {
          x: Math.round(left),
          y: Math.round(top),
          width: Math.round(right - left),
          height: Math.round(bottom - top)
        };
      }

      if (
        nextBounds.x === lastBounds.x &&
        nextBounds.y === lastBounds.y &&
        nextBounds.width === lastBounds.width &&
        nextBounds.height === lastBounds.height
      ) {
        return;
      }
      lastBounds = nextBounds;
      onBoundsChange(nextBounds);
    };

    const stopInteraction = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopInteraction);
      window.removeEventListener('pointercancel', stopInteraction);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopInteraction);
    window.addEventListener('pointercancel', stopInteraction);
  };

  const frameStyle = windowItem.maximized
    ? { zIndex: windowItem.zIndex }
    : {
        zIndex: windowItem.zIndex,
        left: `${windowItem.x}px`,
        top: `${windowItem.y}px`,
        width: `${windowItem.width}px`,
        height: `${windowItem.height}px`
      };

  return (
    <article
      ref={frameRef}
      className={`window-frame ${focused ? 'window-frame--focused' : ''} ${
        windowItem.maximized ? 'window-frame--maximized' : ''
      }`}
      style={frameStyle}
      data-session-id={windowItem.sessionId}
      data-window-id={windowItem.windowId}
      data-app-id={windowItem.appId}
      onPointerDown={onFocus}
    >
      <header
        className="window-frame__header"
        onDoubleClick={() => onToggleMaximize()}
        onPointerDown={(event) => startInteraction(event, 'move')}
      >
        <div className="window-frame__title">
          <span>{windowItem.title}</span>
          <small>
            {showRevision ? `${windowItem.appId} · rev ${windowItem.revision}` : windowItem.appId}
          </small>
        </div>
        <div className="window-frame__actions">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onMinimize}
            aria-label="Minimize window"
          >
            _
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggleMaximize}
            aria-label={windowItem.maximized ? 'Restore window' : 'Maximize window'}
          >
            {windowItem.maximized ? '❐' : '□'}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            aria-label="Close window"
          >
            ×
          </button>
        </div>
      </header>
      <section className="window-frame__content">{children}</section>
      {windowItem.maximized
        ? null
        : RESIZE_DIRECTIONS.map((direction) => (
            <div
              key={direction}
              className={`window-frame__resize-handle window-frame__resize-handle--${direction}`}
              onPointerDown={(event) => startInteraction(event, 'resize', direction)}
            />
          ))}
    </article>
  );
}
