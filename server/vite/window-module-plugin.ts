import type { ViteDevServer, Plugin } from 'vite';
import type { WindowOrchestrator } from '../orchestrator/service';
import type { ModuleUpdateBridge, UpdateStrategy } from '../orchestrator/types';

const WINDOW_MODULE_PREFIX = '/@window-app/';

function decodeSegment(segment: string) {
  return decodeURIComponent(segment);
}

function extractWindowId(id: string): { sessionId: string; windowId: string } | undefined {
  const [path] = id.split('?');
  if (!path.startsWith(WINDOW_MODULE_PREFIX)) {
    return undefined;
  }
  const normalized = path.slice(WINDOW_MODULE_PREFIX.length);
  const parts = normalized.split('/');
  if (parts.length < 3 || parts[2] !== 'entry.tsx') {
    return undefined;
  }
  return {
    sessionId: decodeSegment(parts[0]),
    windowId: decodeSegment(parts[1])
  };
}

export function getWindowModuleId(sessionId: string, windowId: string) {
  return `${WINDOW_MODULE_PREFIX}${encodeURIComponent(sessionId)}/${encodeURIComponent(windowId)}/entry.tsx`;
}

export function createWindowModulePlugin(orchestrator: WindowOrchestrator): Plugin {
  return {
    name: 'aionios-window-module',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith(WINDOW_MODULE_PREFIX)) {
        return source;
      }
      return null;
    },
    load(id) {
      const parsed = extractWindowId(id);
      if (!parsed) {
        return null;
      }
      const snapshot = orchestrator.getWindowModuleSource(parsed.sessionId, parsed.windowId);
      return snapshot.source;
    }
  };
}

function sendRemountEvent(viteServer: ViteDevServer, sessionId: string, windowId: string) {
  viteServer.ws.send({
    type: 'custom',
    event: 'aionios:window-remount',
    data: {
      sessionId,
      windowId,
      timestamp: Date.now()
    }
  });
}

async function sendHmrJsUpdate(viteServer: ViteDevServer, modulePath: string) {
  const moduleNode = await viteServer.moduleGraph.getModuleByUrl(modulePath);
  if (moduleNode) {
    viteServer.moduleGraph.invalidateModule(moduleNode);
  }
  viteServer.ws.send({
    type: 'update',
    updates: [
      {
        type: 'js-update',
        path: modulePath,
        acceptedPath: modulePath,
        timestamp: Date.now()
      }
    ]
  });
}

export class ViteWindowModuleBridge implements ModuleUpdateBridge {
  private readonly hmrEnabled: boolean;

  constructor(private readonly viteServer: ViteDevServer) {
    this.hmrEnabled = this.viteServer.config.server.hmr !== false;
  }

  async pushWindowUpdate(
    sessionId: string,
    windowId: string,
    strategy: UpdateStrategy
  ): Promise<{ strategy: UpdateStrategy }> {
    if (strategy === 'remount') {
      if (this.hmrEnabled) {
        const modulePath = getWindowModuleId(sessionId, windowId);
        try {
          await sendHmrJsUpdate(this.viteServer, modulePath);
        } catch (error) {
          console.error('[aionios] hmr push failed before remount event', error);
        }
        sendRemountEvent(this.viteServer, sessionId, windowId);
      }
      return {
        strategy: 'remount'
      };
    }

    if (!this.hmrEnabled) {
      return {
        strategy: 'remount'
      };
    }

    const modulePath = getWindowModuleId(sessionId, windowId);
    try {
      await sendHmrJsUpdate(this.viteServer, modulePath);
      return { strategy: 'hmr' };
    } catch (error) {
      console.error('[aionios] hmr push failed, switching to remount', error);
      sendRemountEvent(this.viteServer, sessionId, windowId);
      return {
        strategy: 'remount'
      };
    }
  }
}
