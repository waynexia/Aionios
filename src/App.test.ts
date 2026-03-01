import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './App';

function buildStateWithWindow() {
  const withSession = reducer(initialState, {
    type: 'session-ready',
    sessionId: 'session-1'
  });
  return reducer(withSession, {
    type: 'window-open-local',
    sessionId: 'session-1',
    windowId: 'window-1',
    appId: 'writer',
    title: 'Writer'
  });
}

function getWindow(state: ReturnType<typeof buildStateWithWindow>) {
  const windowItem = state.windows.find((item) => item.windowId === 'window-1');
  if (!windowItem) {
    throw new Error('window-1 missing from test state');
  }
  return windowItem;
}

describe('window event ordering guard', () => {
  it('ignores stale open snapshot after ready event', () => {
    const opened = buildStateWithWindow();
    const ready = reducer(opened, {
      type: 'window-server-event',
      event: {
        type: 'window-ready',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'ready',
        revision: 1
      }
    });

    const afterStaleSnapshot = reducer(ready, {
      type: 'window-server-event',
      event: {
        type: 'window-status',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'loading',
        revision: 0,
        strategy: 'remount'
      }
    });

    expect(getWindow(afterStaleSnapshot).status).toBe('ready');
    expect(getWindow(afterStaleSnapshot).revision).toBe(1);
  });

  it('ignores stale open snapshot after error event', () => {
    const opened = buildStateWithWindow();
    const errored = reducer(opened, {
      type: 'window-server-event',
      event: {
        type: 'window-error',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'error',
        error: 'generation failed'
      }
    });

    const afterStaleSnapshot = reducer(errored, {
      type: 'window-server-event',
      event: {
        type: 'window-status',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'loading',
        revision: 0,
        strategy: 'remount'
      }
    });

    expect(getWindow(afterStaleSnapshot).status).toBe('error');
    expect(getWindow(afterStaleSnapshot).error).toBe('generation failed');
  });

  it('still accepts loading transition without revision metadata', () => {
    const opened = buildStateWithWindow();
    const ready = reducer(opened, {
      type: 'window-server-event',
      event: {
        type: 'window-ready',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'ready',
        revision: 1
      }
    });

    const loading = reducer(ready, {
      type: 'window-server-event',
      event: {
        type: 'window-status',
        sessionId: 'session-1',
        windowId: 'window-1',
        status: 'loading'
      }
    });

    expect(getWindow(loading).status).toBe('loading');
    expect(getWindow(loading).revision).toBe(1);
  });

  it('supports bounds updates and maximize toggle behavior', () => {
    const opened = buildStateWithWindow();
    expect(getWindow(opened)).toMatchObject({
      x: 18,
      y: 18,
      width: 760,
      height: 520,
      maximized: false
    });

    const resized = reducer(opened, {
      type: 'window-set-bounds',
      windowId: 'window-1',
      bounds: {
        x: 80,
        y: 70,
        width: 900,
        height: 640
      }
    });
    expect(getWindow(resized)).toMatchObject({
      x: 80,
      y: 70,
      width: 900,
      height: 640,
      maximized: false
    });

    const maximized = reducer(resized, {
      type: 'window-toggle-maximize',
      windowId: 'window-1'
    });
    expect(getWindow(maximized).maximized).toBe(true);

    const ignoredResize = reducer(maximized, {
      type: 'window-set-bounds',
      windowId: 'window-1',
      bounds: {
        x: 15,
        y: 25,
        width: 320,
        height: 260
      }
    });
    expect(getWindow(ignoredResize)).toMatchObject({
      x: 80,
      y: 70,
      width: 900,
      height: 640,
      maximized: true
    });

    const restored = reducer(ignoredResize, {
      type: 'window-toggle-maximize',
      windowId: 'window-1'
    });
    expect(getWindow(restored)).toMatchObject({
      x: 80,
      y: 70,
      width: 900,
      height: 640,
      maximized: false
    });
  });
});
