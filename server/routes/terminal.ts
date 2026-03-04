import type { Express } from 'express';
import { requireTerminalWindowSnapshot } from '../http/route-guards';
import { badRequest, jsonError } from '../http/responses';
import { WindowOrchestrator } from '../orchestrator';
import { TerminalManager } from '../terminal/manager';

export function registerTerminalRoutes(
  app: Express,
  deps: {
    orchestrator: WindowOrchestrator;
    terminalManager: TerminalManager;
  }
) {
  const { orchestrator, terminalManager } = deps;

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/start', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      if (!requireTerminalWindowSnapshot(orchestrator, response, sessionId, windowId)) {
        return;
      }
      const metadata = terminalManager.start(sessionId, windowId);
      response.status(200).json(metadata);
    } catch (error) {
      const message = (error as Error).message;
      jsonError(response, message.includes('not found') ? 404 : 500, message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/input', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { input } = request.body as { input?: string };
    if (typeof input !== 'string' || input.length === 0) {
      badRequest(response, 'input must be a non-empty string.');
      return;
    }
    try {
      if (!requireTerminalWindowSnapshot(orchestrator, response, sessionId, windowId)) {
        return;
      }
      terminalManager.write(sessionId, windowId, input);
      response.status(202).json({ ok: true });
    } catch (error) {
      const message = (error as Error).message;
      jsonError(response, message.includes('not found') ? 404 : 400, message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/terminal/stop', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      if (!requireTerminalWindowSnapshot(orchestrator, response, sessionId, windowId)) {
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
}

