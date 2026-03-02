import type { ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { ViteWindowModuleBridge } from './window-module-plugin';

function createViteServer(hmr: false | object | undefined): ViteDevServer {
  return {
    config: {
      server: {
        hmr
      }
    },
    ws: {
      send: vi.fn()
    },
    moduleGraph: {
      getModuleByUrl: vi.fn(),
      invalidateModule: vi.fn()
    }
  } as unknown as ViteDevServer;
}

describe('ViteWindowModuleBridge', () => {
  it('falls back to remount when HMR is disabled', async () => {
    const viteServer = createViteServer(false);
    const bridge = new ViteWindowModuleBridge(viteServer);
    const result = await bridge.pushWindowUpdate('session-1', 'window-1', 'hmr');

    expect(result).toEqual({ strategy: 'remount' });
    expect(viteServer.ws.send).not.toHaveBeenCalled();
  });

  it('skips websocket remount when HMR is disabled', async () => {
    const viteServer = createViteServer(false);
    const bridge = new ViteWindowModuleBridge(viteServer);
    const result = await bridge.pushWindowUpdate('session-1', 'window-1', 'remount');

    expect(result).toEqual({ strategy: 'remount' });
    expect(viteServer.ws.send).not.toHaveBeenCalled();
  });

  it('sends websocket remount when HMR is enabled', async () => {
    const viteServer = createViteServer(undefined);
    const bridge = new ViteWindowModuleBridge(viteServer);
    const result = await bridge.pushWindowUpdate('session-1', 'window-1', 'remount');

    expect(result).toEqual({ strategy: 'remount' });
    expect(viteServer.ws.send).toHaveBeenCalledTimes(2);
    expect(viteServer.ws.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'update'
      })
    );
    expect(viteServer.ws.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'custom',
        event: 'aionios:window-remount'
      })
    );
  });
});
