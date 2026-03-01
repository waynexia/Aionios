import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const VIEWPORT_MARGIN_PX = 10;

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(() => ({ x, y }));
  const hasEnabledItems = useMemo(() => items.some((item) => !item.disabled), [items]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPosition({ x, y });
  }, [open, x, y]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const maxX = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX);
    const maxY = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX);
    const nextX = clamp(position.x, VIEWPORT_MARGIN_PX, maxX);
    const nextY = clamp(position.y, VIEWPORT_MARGIN_PX, maxY);
    if (nextX === position.x && nextY === position.y) {
      return;
    }
    setPosition({ x: nextX, y: nextY });
  }, [open, position.x, position.y]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!hasEnabledItems) {
      return;
    }
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const firstItem = menu.querySelector<HTMLButtonElement>('button:not([disabled])');
    firstItem?.focus();
  }, [hasEnabledItems, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="context-menu-overlay"
      data-context-menu-overlay
      onPointerDown={() => onClose()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setPosition({ x: event.clientX, y: event.clientY });
      }}
    >
      <div
        ref={menuRef}
        className="context-menu"
        data-context-menu
        role="menu"
        style={{
          left: position.x,
          top: position.y
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="context-menu__item"
            data-context-menu-item={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

