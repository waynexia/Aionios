import fs from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WindowOrchestrator } from './orchestrator';
import { TerminalManager } from './terminal/manager';
import {
  ViteWindowModuleBridge,
  createWindowModulePlugin
} from './vite/window-module-plugin';

const port = Number(process.env.PORT ?? 5173);

async function startServer() {
  const app = express();
  const orchestrator = new WindowOrchestrator();
  const terminalManager = new TerminalManager((event) => {
    orchestrator.publishSessionEvent(event);
  });
  const windowPlugin = createWindowModulePlugin(orchestrator);
  const vite = await createViteServer({
    plugins: [windowPlugin],
    appType: 'custom',
    server: {
      middlewareMode: true
    }
  });

  orchestrator.attachModuleBridge(new ViteWindowModuleBridge(vite));

  app.use(express.json());

  app.post('/api/sessions', (_request, response) => {
    const sessionId = orchestrator.createSession();
    response.status(201).json({ sessionId });
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

  app.post('/api/sessions/:sessionId/windows/open', (request, response) => {
    const { sessionId } = request.params;
    const { windowId, appId, title } = request.body as {
      windowId?: string;
      appId?: string;
      title?: string;
    };
    if (!windowId || !appId || !title) {
      response.status(400).json({
        message: 'windowId, appId, and title are required.'
      });
      return;
    }
    try {
      const snapshot = orchestrator.openWindow({
        sessionId,
        windowId,
        appId,
        title
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

  app.listen(port, () => {
    console.log(`[aionios] dev server listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('[aionios] unable to start server', error);
  process.exit(1);
});
