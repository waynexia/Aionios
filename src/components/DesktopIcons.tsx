import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AppDefinition } from '../types';

interface IconPosition {
  x: number;
  y: number;
}

interface IconDragSession {
  appId: string;
  pointerId: number;
  startX: number;
  startY: number;
  origin: IconPosition;
  containerWidth: number;
  containerHeight: number;
  iconWidth: number;
  iconHeight: number;
  moved: boolean;
}

const ICON_INITIAL_X = 8;
const ICON_INITIAL_Y = 8;
const ICON_HORIZONTAL_SPACING = 124;
const ICON_VERTICAL_SPACING = 94;
const DRAG_THRESHOLD_PX = 3;
const SUPPRESS_CLICK_MS = 250;
const ESTIMATED_TASKBAR_HEIGHT_PX = 54;
const ESTIMATED_WORKSPACE_INSET_PX = 32;

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function getMaxRows(availableHeight: number) {
  return Math.max(1, Math.floor((availableHeight - ICON_INITIAL_Y) / ICON_VERTICAL_SPACING));
}

function getInitialMaxRows() {
  if (typeof window === 'undefined') {
    return 7;
  }
  const estimatedHeight = Math.max(
    1,
    window.innerHeight - ESTIMATED_TASKBAR_HEIGHT_PX - ESTIMATED_WORKSPACE_INSET_PX
  );
  return getMaxRows(estimatedHeight);
}

function positionForIndex(index: number, maxRows: number): IconPosition {
  const row = index % maxRows;
  const col = Math.floor(index / maxRows);
  return {
    x: ICON_INITIAL_X + col * ICON_HORIZONTAL_SPACING,
    y: ICON_INITIAL_Y + row * ICON_VERTICAL_SPACING
  };
}

function createDefaultPositions(apps: AppDefinition[]) {
  const maxRows = getInitialMaxRows();
  return apps.reduce<Record<string, IconPosition>>((acc, app, index) => {
    acc[app.appId] = positionForIndex(index, maxRows);
    return acc;
  }, {});
}

interface DesktopIconsProps {
  apps: AppDefinition[];
  onOpenApp: (appId: string) => void;
  interactionMode?: 'desktop' | 'mobile';
}

export function DesktopIcons({
  apps,
  onOpenApp,
  interactionMode = 'desktop'
}: DesktopIconsProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const dragSessionRef = useRef<IconDragSession | null>(null);
  const suppressedOpenUntilRef = useRef<Record<string, number>>({});
  const [positions, setPositions] = useState<Record<string, IconPosition>>(() =>
    createDefaultPositions(apps)
  );
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const isMobile = interactionMode === 'mobile';

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current };
      let changed = false;
      const container = containerRef.current;
      const maxRows = container ? getMaxRows(container.clientHeight) : getInitialMaxRows();
      for (const app of apps) {
        if (!next[app.appId]) {
          next[app.appId] = positionForIndex(Object.keys(next).length, maxRows);
          changed = true;
        }
      }
      for (const appId of Object.keys(next)) {
        if (!apps.some((app) => app.appId === appId)) {
          delete next[appId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [apps]);

  useEffect(() => {
    if (!selectedAppId) {
      return;
    }
    if (apps.some((app) => app.appId === selectedAppId)) {
      return;
    }
    setSelectedAppId(null);
  }, [apps, selectedAppId]);

  const onDesktopPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    setSelectedAppId(null);
  };

  const onDesktopMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    setSelectedAppId(null);
  };

  const onIconPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    appId: string
  ) => {
    setSelectedAppId(appId);
    if ((event.pointerType === 'mouse' && event.button !== 0) || isMobile) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const iconElement = event.currentTarget;
    const position = positions[appId] ?? {
      x: ICON_INITIAL_X,
      y: ICON_INITIAL_Y
    };
    dragSessionRef.current = {
      appId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      iconWidth: iconElement.offsetWidth,
      iconHeight: iconElement.offsetHeight,
      moved: false
    };
    iconElement.setPointerCapture(event.pointerId);
  };

  const onIconPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
    appId: string
  ) => {
    const session = dragSessionRef.current;
    if (!session || session.appId !== appId || session.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      session.moved = true;
      document.body.style.userSelect = 'none';
    }
    if (!session.moved) {
      return;
    }
    event.preventDefault();
    const maxX = Math.max(0, session.containerWidth - session.iconWidth);
    const maxY = Math.max(0, session.containerHeight - session.iconHeight);
    const nextPosition = {
      x: Math.round(clamp(session.origin.x + deltaX, 0, maxX)),
      y: Math.round(clamp(session.origin.y + deltaY, 0, maxY))
    };
    setPositions((current) => {
      const currentPosition = current[appId];
      if (
        currentPosition &&
        currentPosition.x === nextPosition.x &&
        currentPosition.y === nextPosition.y
      ) {
        return current;
      }
      return {
        ...current,
        [appId]: nextPosition
      };
    });
  };

  const onIconPointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
    appId: string
  ) => {
    const session = dragSessionRef.current;
    if (!session || session.appId !== appId || session.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (session.moved) {
      suppressedOpenUntilRef.current[appId] = Date.now() + SUPPRESS_CLICK_MS;
      document.body.style.userSelect = '';
    }
    dragSessionRef.current = null;
  };

  const onIconMouseDown = (appId: string) => {
    setSelectedAppId(appId);
  };

  const onIconClick = (event: ReactMouseEvent<HTMLButtonElement>, appId: string) => {
    const suppressUntil = suppressedOpenUntilRef.current[appId] ?? 0;
    if (suppressUntil > Date.now()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setSelectedAppId(appId);
    if (isMobile) {
      onOpenApp(appId);
    }
  };

  const onIconDoubleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    appId: string
  ) => {
    if (isMobile) {
      return;
    }
    const suppressUntil = suppressedOpenUntilRef.current[appId] ?? 0;
    if (suppressUntil > Date.now()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onOpenApp(appId);
  };

  const onIconContextMenu = (appId: string) => {
    setSelectedAppId(appId);
  };

  if (isMobile) {
    return (
      <section
        ref={containerRef}
        className="desktop-icons desktop-icons--mobile"
        aria-label="Desktop apps"
        onPointerDown={onDesktopPointerDown}
        onMouseDown={onDesktopMouseDown}
      >
        {apps.map((app) => {
          const isSelected = selectedAppId === app.appId;
          return (
            <button
              key={app.appId}
              className={`desktop-icon desktop-icon--mobile${isSelected ? ' desktop-icon--selected' : ''}`}
              data-app-id={app.appId}
              onPointerDown={(event) => onIconPointerDown(event, app.appId)}
              onMouseDown={() => onIconMouseDown(app.appId)}
              onClick={(event) => onIconClick(event, app.appId)}
              onContextMenu={() => onIconContextMenu(app.appId)}
              title={`${app.title} — ${app.hint}`}
            >
              <span className="desktop-icon__glow" aria-hidden="true" />
              <span className="desktop-icon__emoji">{app.icon}</span>
              <span className="desktop-icon__label">{app.title}</span>
              <span className="desktop-icon__hint">{app.hint}</span>
            </button>
          );
        })}
      </section>
    );
  }

  return (
    <section
      ref={containerRef}
      className="desktop-icons"
      aria-label="Desktop apps"
      onPointerDown={onDesktopPointerDown}
      onMouseDown={onDesktopMouseDown}
    >
      {apps.map((app) => {
        const position = positions[app.appId] ?? {
          x: ICON_INITIAL_X,
          y: ICON_INITIAL_Y
        };
        const isSelected = selectedAppId === app.appId;
        return (
          <button
            key={app.appId}
            className={`desktop-icon${isSelected ? ' desktop-icon--selected' : ''}`}
            data-app-id={app.appId}
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`
            }}
            onPointerDown={(event) => onIconPointerDown(event, app.appId)}
            onPointerMove={(event) => onIconPointerMove(event, app.appId)}
            onPointerUp={(event) => onIconPointerEnd(event, app.appId)}
            onPointerCancel={(event) => onIconPointerEnd(event, app.appId)}
            onMouseDown={() => onIconMouseDown(app.appId)}
            onClick={(event) => onIconClick(event, app.appId)}
            onDoubleClick={(event) => onIconDoubleClick(event, app.appId)}
            onContextMenu={() => onIconContextMenu(app.appId)}
            title={`${app.title} — ${app.hint}`}
          >
            <span className="desktop-icon__glow" aria-hidden="true" />
            <span className="desktop-icon__emoji">{app.icon}</span>
            <span className="desktop-icon__label">{app.title}</span>
            <span className="desktop-icon__hint">{app.hint}</span>
          </button>
        );
      })}
    </section>
  );
}
