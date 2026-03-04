import { useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { AppDefinition, PersistedAppDescriptor } from '../types';
import { buildDesktopContextMenuItems, type DesktopContextMenuState } from '../desktop/context-menu-items';
import { resolveDesktopContextMenuState } from '../desktop/context-menu-resolver';

function shouldKeepNativeContextMenu(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, option, [contenteditable], .xterm'));
}

export function useDesktopContextMenu(options: {
  openApp: (appId: string) => Promise<void>;
  refreshPersistedApps: () => Promise<void>;
  trashVirtualPath: (virtualPath: string) => Promise<void>;
  resolveAppDefinition: (appId: string) => AppDefinition | undefined;
  persistedAppDescriptorById: Map<string, PersistedAppDescriptor>;
  openCreateDialog: (directory: string) => void;
  openOpenDialog: (input: { appId: string; title: string; hint: string }) => void;
}) {
  const {
    openApp,
    openCreateDialog,
    openOpenDialog,
    persistedAppDescriptorById,
    refreshPersistedApps,
    resolveAppDefinition,
    trashVirtualPath
  } = options;

  const [contextMenu, setContextMenu] = useState<DesktopContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.shiftKey || shouldKeepNativeContextMenu(event.target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    setContextMenu(
      resolveDesktopContextMenuState({
        target,
        x: event.clientX,
        y: event.clientY
      })
    );
  }, []);

  const contextMenuItems = useMemo(
    () =>
      buildDesktopContextMenuItems({
        contextMenu,
        openApp,
        refreshPersistedApps,
        trashVirtualPath,
        resolveAppDefinition,
        persistedAppDescriptorById,
        onCreateNewApp: openCreateDialog,
        onOpenWithPrompt: openOpenDialog
      }),
    [
      contextMenu,
      openApp,
      openCreateDialog,
      openOpenDialog,
      persistedAppDescriptorById,
      refreshPersistedApps,
      resolveAppDefinition,
      trashVirtualPath
    ]
  );

  return {
    contextMenu,
    contextMenuItems,
    closeContextMenu,
    onContextMenu
  };
}

