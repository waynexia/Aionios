import type { DesktopWindow } from '../types';

export const MOBILE_BREAKPOINT_PX = 768;

function sortWindowsByRecency(windows: DesktopWindow[]) {
  return [...windows].sort((left, right) => right.zIndex - left.zIndex);
}

export function isMobileViewportWidth(width: number) {
  return width <= MOBILE_BREAKPOINT_PX;
}

export function getMostRecentWindowId(
  windows: DesktopWindow[],
  options?: {
    excludeWindowId?: string;
  }
) {
  const excludeWindowId = options?.excludeWindowId;
  const candidate = sortWindowsByRecency(windows).find(
    (windowItem) => windowItem.windowId !== excludeWindowId
  );
  return candidate?.windowId ?? null;
}

export function getRenderableMobileWindowId(
  windows: DesktopWindow[],
  foregroundWindowId?: string,
  focusedWindowId?: string
) {
  if (foregroundWindowId && windows.some((windowItem) => windowItem.windowId === foregroundWindowId)) {
    return foregroundWindowId;
  }
  if (focusedWindowId && windows.some((windowItem) => windowItem.windowId === focusedWindowId)) {
    return focusedWindowId;
  }
  return getMostRecentWindowId(windows) ?? null;
}

export function getMobileBackTarget(
  windows: DesktopWindow[],
  currentWindowId?: string
) {
  return getMostRecentWindowId(windows, {
    excludeWindowId: currentWindowId
  });
}

export function getNextMobileForegroundAfterClose(
  windows: DesktopWindow[],
  closingWindowId: string,
  preferredWindowId?: string
) {
  const remainingWindows = windows.filter((windowItem) => windowItem.windowId !== closingWindowId);
  if (
    preferredWindowId &&
    preferredWindowId !== closingWindowId &&
    remainingWindows.some((windowItem) => windowItem.windowId === preferredWindowId)
  ) {
    return preferredWindowId;
  }
  return getMostRecentWindowId(remainingWindows);
}
