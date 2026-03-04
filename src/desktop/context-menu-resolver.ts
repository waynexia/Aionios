import type { DesktopContextMenuState } from './context-menu-items';

export function resolveDesktopContextMenuState(input: {
  target: Element | null;
  x: number;
  y: number;
}): DesktopContextMenuState {
  const { target, x, y } = input;

  const icon = target ? target.closest('.desktop-icon[data-app-id]') : null;
  if (icon instanceof HTMLElement) {
    const appId = icon.getAttribute('data-app-id');
    if (appId) {
      return { kind: 'icon', x, y, appId };
    }
  }

  const directoryEntry = target?.closest<HTMLElement>('[data-directory-entry-path]');
  const entryPath = directoryEntry?.getAttribute('data-directory-entry-path') ?? '';
  if (entryPath.trim().length > 0) {
    return {
      kind: 'file',
      x,
      y,
      path: entryPath.trim()
    };
  }

  const recycleBinItem = target?.closest<HTMLElement>('[data-recycle-bin-item-id]');
  if (recycleBinItem) {
    const itemId = recycleBinItem.getAttribute('data-recycle-bin-item-id') ?? '';
    const originalPath = recycleBinItem.getAttribute('data-recycle-bin-original-path') ?? '';
    const recycleBinFrame = recycleBinItem.closest<HTMLElement>(
      '.window-frame[data-app-id="recycle-bin"][data-window-id]'
    );
    const windowId = recycleBinFrame?.getAttribute('data-window-id') ?? '';
    if (itemId.trim().length > 0 && windowId.trim().length > 0) {
      return {
        kind: 'recycle-bin-item',
        x,
        y,
        windowId: windowId.trim(),
        itemId: itemId.trim(),
        originalPath
      };
    }
  }

  const directoryGroup = target?.closest<HTMLElement>('[data-directory-group]');
  const groupDirectory = directoryGroup?.getAttribute('data-directory-group') ?? '';
  if (groupDirectory.trim().length > 0) {
    const directory = groupDirectory.trim();
    const directoryFrame = directoryGroup?.closest<HTMLElement>(
      '.window-frame[data-app-id="directory"][data-window-id]'
    );
    const windowId = directoryFrame?.getAttribute('data-window-id') ?? '';
    if (windowId.trim().length > 0) {
      return {
        kind: 'directory',
        x,
        y,
        directory,
        windowId: windowId.trim()
      };
    }
    return { kind: 'desktop', x, y, directory: '/' };
  }

  const directoryApp = target?.closest<HTMLElement>('[data-directory-app]');
  if (directoryApp) {
    const directoryFrame = directoryApp.closest<HTMLElement>(
      '.window-frame[data-app-id="directory"][data-window-id]'
    );
    const windowId = directoryFrame?.getAttribute('data-window-id') ?? '';
    if (windowId.trim().length > 0) {
      return {
        kind: 'directory',
        x,
        y,
        directory: '/',
        windowId: windowId.trim()
      };
    }
  }

  const recycleBinApp = target?.closest<HTMLElement>('[data-recycle-bin-app]');
  if (recycleBinApp) {
    const recycleBinFrame = recycleBinApp.closest<HTMLElement>(
      '.window-frame[data-app-id="recycle-bin"][data-window-id]'
    );
    const windowId = recycleBinFrame?.getAttribute('data-window-id') ?? '';
    if (windowId.trim().length > 0) {
      return {
        kind: 'recycle-bin',
        x,
        y,
        windowId: windowId.trim()
      };
    }
  }

  return { kind: 'desktop', x, y, directory: '/' };
}

