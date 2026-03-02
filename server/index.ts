import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { PreferenceConfigStore } from './config';
import { WindowOrchestrator } from './orchestrator';
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
  const preferenceConfigStore = new PreferenceConfigStore({
    filePath: args.configPath ?? undefined
  });
  await preferenceConfigStore.load();
  const initialConfig = preferenceConfigStore.getConfig();

  const orchestrator = new WindowOrchestrator(() => preferenceConfigStore.getConfig());
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

  app.post('/api/sessions', (_request, response) => {
    const sessionId = orchestrator.createSession();
    response.status(201).json({ sessionId });
  });

  app.get('/api/config', (_request, response) => {
    response.status(200).json(preferenceConfigStore.getConfig());
  });

  app.put('/api/config', async (request, response) => {
    try {
      const updated = await preferenceConfigStore.update(request.body);
      response.status(200).json(updated);
    } catch (error) {
      const message = (error as Error).message;
      const isValidationError =
        message.includes('Unknown preference') ||
        message.includes('must be') ||
        message.includes('payload');
      response.status(isValidationError ? 400 : 500).json({
        message
      });
    }
  });

  app.get('/api/sessions/:sessionId/events', (request, response) => {
    const { sessionId } = request.params;
    orchestrator.ensureSession(sessionId);
    orchestrator.subscribe(sessionId, response);
  });

  app.get('/api/sessions/:sessionId/windows', (request, response) => {
    const { sessionId } = request.params;
    orchestrator.ensureSession(sessionId);
    response.json({
      windows: orchestrator.listWindows(sessionId)
    });
  });

  app.get('/api/sessions/:sessionId/windows/:windowId', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      response.json(orchestrator.getWindowSnapshot(sessionId, windowId));
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      response.status(200).json({
        revisions: orchestrator.listWindowRevisions(sessionId, windowId)
      });
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions/:revision', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = Number.parseInt(request.params.revision, 10);
    if (!Number.isFinite(parsedRevision) || parsedRevision <= 0) {
      response.status(400).json({
        message: 'revision must be a positive integer.'
      });
      return;
    }
    try {
      response.status(200).json(orchestrator.getWindowRevision(sessionId, windowId, parsedRevision));
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions/:revision/prompt', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = Number.parseInt(request.params.revision, 10);
    if (!Number.isFinite(parsedRevision) || parsedRevision <= 0) {
      response.status(400).json({
        message: 'revision must be a positive integer.'
      });
      return;
    }
    try {
      response
        .status(200)
        .json(orchestrator.getWindowRevisionPrompt(sessionId, windowId, parsedRevision));
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.post(
    '/api/sessions/:sessionId/windows/:windowId/revisions/:revision/branch',
    (request, response) => {
      const { sessionId, windowId } = request.params;
      const parsedRevision = Number.parseInt(request.params.revision, 10);
      const { newWindowId, title } = request.body as { newWindowId?: string; title?: string };
      if (!Number.isFinite(parsedRevision) || parsedRevision <= 0) {
        response.status(400).json({
          message: 'revision must be a positive integer.'
        });
        return;
      }
      if (typeof newWindowId !== 'string' || newWindowId.trim().length === 0) {
        response.status(400).json({
          message: 'newWindowId is required.'
        });
        return;
      }
      const normalizedTitle = typeof title === 'string' && title.trim().length > 0 ? title.trim() : undefined;
      try {
        const snapshot = orchestrator.branchWindowRevision({
          sessionId,
          sourceWindowId: windowId,
          sourceRevision: parsedRevision,
          newWindowId,
          title: normalizedTitle
        });
        response.status(201).json(snapshot);
      } catch (error) {
        response.status(404).json({
          message: (error as Error).message
        });
      }
    }
  );

  app.post('/api/sessions/:sessionId/windows/:windowId/revisions/:revision/regenerate', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = Number.parseInt(request.params.revision, 10);
    if (!Number.isFinite(parsedRevision) || parsedRevision <= 0) {
      response.status(400).json({
        message: 'revision must be a positive integer.'
      });
      return;
    }
    try {
      const snapshot = orchestrator.regenerateWindowRevision(sessionId, windowId, parsedRevision);
      response.status(202).json(snapshot);
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/open', (request, response) => {
    const { sessionId } = request.params;
    const { windowId, appId, title, instruction } = request.body as {
      windowId?: string;
      appId?: string;
      title?: string;
      instruction?: unknown;
    };
    if (!windowId || !appId || !title) {
      response.status(400).json({
        message: 'windowId, appId, and title are required.'
      });
      return;
    }
    if (instruction !== undefined && typeof instruction !== 'string') {
      response.status(400).json({
        message: 'instruction must be a string when provided.'
      });
      return;
    }
    const normalizedInstruction =
      typeof instruction === 'string' && instruction.trim().length > 0
        ? instruction.trim()
        : undefined;
    try {
      const snapshot = orchestrator.openWindow({
        sessionId,
        windowId,
        appId,
        title,
        instruction: normalizedInstruction
      });
      response.status(202).json(snapshot);
    } catch (error) {
      response.status(500).json({
        message: (error as Error).message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/actions', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { instruction } = request.body as { instruction?: string };
    if (!instruction) {
      response.status(400).json({
        message: 'instruction is required.'
      });
      return;
    }
    try {
      const snapshot = orchestrator.requestUpdate({
        sessionId,
        windowId,
        instruction
      });
      response.status(202).json(snapshot);
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/actions/prompt', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { prompt } = request.body as { prompt?: string };
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      response.status(400).json({
        message: 'prompt is required.'
      });
      return;
    }
    try {
      const snapshot = orchestrator.requestPromptUpdate({
        sessionId,
        windowId,
        prompt
      });
      response.status(202).json(snapshot);
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.delete('/api/sessions/:sessionId/windows/:windowId', (request, response) => {
    const { sessionId, windowId } = request.params;
    terminalManager.close(sessionId, windowId);
    const removed = orchestrator.closeWindow(sessionId, windowId);
    response.status(removed ? 204 : 404).end();
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/rollback', async (request, response) => {
    const { sessionId, windowId } = request.params;
    const { revision } = request.body as { revision?: number };
    if (typeof revision !== 'number') {
      response.status(400).json({
        message: 'revision must be a number.'
      });
      return;
    }
    try {
      const snapshot = await orchestrator.rollbackWindow(sessionId, windowId, revision);
      response.status(200).json(snapshot);
    } catch (error) {
      response.status(404).json({
        message: (error as Error).message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/start', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      const snapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
      if (snapshot.appId !== 'terminal') {
        response.status(400).json({
          message: 'Terminal API is only available for terminal windows.'
        });
        return;
      }
      const metadata = terminalManager.start(sessionId, windowId);
      response.status(200).json(metadata);
    } catch (error) {
      const message = (error as Error).message;
      response.status(message.includes('not found') ? 404 : 500).json({
        message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/input', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { input } = request.body as { input?: string };
    if (typeof input !== 'string' || input.length === 0) {
      response.status(400).json({
        message: 'input must be a non-empty string.'
      });
      return;
    }
    try {
      const snapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
      if (snapshot.appId !== 'terminal') {
        response.status(400).json({
          message: 'Terminal API is only available for terminal windows.'
        });
        return;
      }
      terminalManager.write(sessionId, windowId, input);
      response.status(202).json({ ok: true });
    } catch (error) {
      const message = (error as Error).message;
      response.status(message.includes('not found') ? 404 : 400).json({
        message
      });
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/stop', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      const snapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
      if (snapshot.appId !== 'terminal') {
        response.status(400).json({
          message: 'Terminal API is only available for terminal windows.'
        });
        return;
      }
    } catch {
      response.status(404).json({
        closed: false
      });
      return;
    }
    const closed = terminalManager.close(sessionId, windowId);
    response.status(closed ? 202 : 404).json({
      closed
    });
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
    response.status(500).json({
      message: error.message
    });
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
