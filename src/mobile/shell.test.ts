import { describe, expect, it } from 'vitest';
import type { DesktopWindow } from '../types';
import {
  getMobileBackTarget,
  getMostRecentWindowId,
  getNextMobileForegroundAfterClose,
  getRenderableMobileWindowId,
  isMobileViewportWidth
} from './shell';

function buildWindow(input: Partial<DesktopWindow> & Pick<DesktopWindow, 'windowId' | 'zIndex'>): DesktopWindow {
  return {
    windowId: input.windowId,
    sessionId: 'session-1',
    appId: input.appId ?? 'editor',
    title: input.title ?? input.windowId,
    x: input.x ?? 0,
    y: input.y ?? 0,
    width: input.width ?? 760,
    height: input.height ?? 520,
    maximized: input.maximized ?? false,
    status: input.status ?? 'ready',
    revision: input.revision ?? 1,
    strategy: input.strategy ?? 'hmr',
    mountNonce: input.mountNonce ?? 0,
    minimized: input.minimized ?? false,
    zIndex: input.zIndex
  };
}

describe('mobile shell helpers', () => {
  it('treats compact widths as mobile mode', () => {
    expect(isMobileViewportWidth(768)).toBe(true);
    expect(isMobileViewportWidth(769)).toBe(false);
  });

  it('resolves most-recent windows by z-index', () => {
    const windows = [
      buildWindow({ windowId: 'one', zIndex: 10 }),
      buildWindow({ windowId: 'two', zIndex: 16 }),
      buildWindow({ windowId: 'three', zIndex: 14 })
    ];

    expect(getMostRecentWindowId(windows)).toBe('two');
    expect(getMostRecentWindowId(windows, { excludeWindowId: 'two' })).toBe('three');
  });

  it('prefers the explicit mobile foreground when it still exists', () => {
    const windows = [
      buildWindow({ windowId: 'one', zIndex: 10 }),
      buildWindow({ windowId: 'two', zIndex: 16 }),
      buildWindow({ windowId: 'three', zIndex: 14 })
    ];

    expect(getRenderableMobileWindowId(windows, 'three', 'two')).toBe('three');
    expect(getRenderableMobileWindowId(windows, 'missing', 'two')).toBe('two');
    expect(getRenderableMobileWindowId(windows, 'missing', 'missing')).toBe('two');
  });

  it('picks the previous recent task as the mobile back target', () => {
    const windows = [
      buildWindow({ windowId: 'one', zIndex: 10 }),
      buildWindow({ windowId: 'two', zIndex: 16 }),
      buildWindow({ windowId: 'three', zIndex: 14 })
    ];

    expect(getMobileBackTarget(windows, 'two')).toBe('three');
    expect(getMobileBackTarget(windows, 'three')).toBe('two');
    expect(getMobileBackTarget([buildWindow({ windowId: 'solo', zIndex: 8 })], 'solo')).toBeNull();
  });

  it('keeps a preferred foreground window after closing a different task', () => {
    const windows = [
      buildWindow({ windowId: 'one', zIndex: 10 }),
      buildWindow({ windowId: 'two', zIndex: 16 }),
      buildWindow({ windowId: 'three', zIndex: 14 })
    ];

    expect(getNextMobileForegroundAfterClose(windows, 'one', 'two')).toBe('two');
    expect(getNextMobileForegroundAfterClose(windows, 'two', 'two')).toBe('three');
    expect(getNextMobileForegroundAfterClose(windows, 'three')).toBe('two');
    expect(getNextMobileForegroundAfterClose([buildWindow({ windowId: 'solo', zIndex: 8 })], 'solo')).toBeNull();
  });
});
