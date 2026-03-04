import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { PreferenceConfigStore } from './config';
import { internalError } from './http/responses';
import { WindowOrchestrator } from './orchestrator';
import { registerApiRoutes } from './routes';
import { HostFileSystem } from './storage/host-fs';
import { PersistedAppStore } from './storage/persisted-apps';
import { RecycleBinStore } from './storage/recycle-bin';
import { TerminalManager } from './terminal/manager';
import { attachTerminalWebSocketServer } from './terminal/ws';
import {
  ViteWindowModuleBridge,
  createWindowModulePlugin
} from './vite/window-module-plugin';

function parseArgs(argv: string[]) {
  let configPath: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config-path' || arg === '--config') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      configPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--config-path=')) {
      configPath = arg.slice('--config-path='.length);
    }
  }

  const resolvedConfigPath =
    configPath && configPath.trim().length > 0
      ? path.isAbsolute(configPath)
        ? configPath
        : path.resolve(process.cwd(), configPath)
      : null;

  return {
    configPath: resolvedConfigPath
  };
}

async function startServer() {
  const app = express();
  const args = parseArgs(process.argv.slice(2));

  const dataDir = (() => {
    if (!args.configPath) {
      return path.resolve(process.cwd(), '.aionios');
    }
    const configDir = path.dirname(args.configPath);
    return path.basename(configDir) === '.aionios'
      ? configDir
      : path.join(configDir, '.aionios');
  })();
  const hostFs = new HostFileSystem({
    rootDir: path.join(dataDir, 'fs')
  });
  const recycleBinStore = new RecycleBinStore({
    rootDir: path.join(dataDir, 'recycle-bin')
  });
  const persistedAppStore = new PersistedAppStore({
    rootDir: path.join(dataDir, 'tmp', 'apps'),
    managedPrefix: 'app-'
  });

  const preferenceConfigStore = new PreferenceConfigStore({
    filePath: args.configPath ?? undefined
  });
  await preferenceConfigStore.load();
  const initialConfig = preferenceConfigStore.getConfig();

  const orchestrator = new WindowOrchestrator(() => preferenceConfigStore.getConfig(), {
    persistedAppStore
  });
  const terminalManager = new TerminalManager((event) => {
    orchestrator.publishSessionEvent(event);
  }, () => preferenceConfigStore.getConfig());
  const windowPlugin = createWindowModulePlugin(orchestrator);
  const disableHmr = initialConfig.serverDisableHmr;
  const vite = await createViteServer({
    plugins: [windowPlugin],
    appType: 'custom',
    server: {
      middlewareMode: true,
      hmr: disableHmr ? false : undefined
    }
  });

  orchestrator.attachModuleBridge(new ViteWindowModuleBridge(vite));

  app.use(express.json());

  registerApiRoutes(app, {
    hostFs,
    recycleBinStore,
    orchestrator,
    preferenceConfigStore,
    terminalManager
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    try {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const template = await fs.readFile(htmlPath, 'utf8');
      const transformed = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });

  app.use((error: Error, _request: Request, response: Response, next: NextFunction) => {
    void next;
    console.error('[aionios] unhandled error', error);
    internalError(response, error.message);
  });

  const server = app.listen(initialConfig.serverPort, () => {
    console.log(`[aionios] dev server listening on http://localhost:${initialConfig.serverPort}`);
  });

  attachTerminalWebSocketServer({
    server,
    orchestrator,
    terminalManager
  });
}

startServer().catch((error) => {
  console.error('[aionios] unable to start server', error);
  process.exit(1);
});
