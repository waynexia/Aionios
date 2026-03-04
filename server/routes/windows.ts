import type { Express } from 'express';
import { badRequest, internalError, notFound } from '../http/responses';
import { WindowOrchestrator } from '../orchestrator';
import { TerminalManager } from '../terminal/manager';

export function registerWindowRoutes(
  app: Express,
  deps: {
    orchestrator: WindowOrchestrator;
    terminalManager: TerminalManager;
  }
) {
  const { orchestrator, terminalManager } = deps;

  app.get('/api/sessions/:sessionId/windows/:windowId', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      response.json(orchestrator.getWindowSnapshot(sessionId, windowId));
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/open', async (request, response) => {
    const { sessionId } = request.params;
    const { windowId, appId, title, instruction } = request.body as {
      windowId?: string;
      appId?: string;
      title?: string;
      instruction?: unknown;
    };
    if (!windowId || !appId || !title) {
      badRequest(response, 'windowId, appId, and title are required.');
      return;
    }
    if (instruction !== undefined && typeof instruction !== 'string') {
      badRequest(response, 'instruction must be a string when provided.');
      return;
    }
    const normalizedInstruction =
      typeof instruction === 'string' && instruction.trim().length > 0
        ? instruction.trim()
        : undefined;
    try {
      const snapshot = await orchestrator.openWindow({
        sessionId,
        windowId,
        appId,
        title,
        instruction: normalizedInstruction
      });
      response.status(202).json(snapshot);
    } catch (error) {
      internalError(response, (error as Error).message);
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
      badRequest(response, 'revision must be a number.');
      return;
    }
    try {
      const snapshot = await orchestrator.rollbackWindow(sessionId, windowId, revision);
      response.status(200).json(snapshot);
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });
}

