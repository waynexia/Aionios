import type { Express } from 'express';
import { WindowOrchestrator } from '../orchestrator';

export function registerSessionRoutes(
  app: Express,
  deps: {
    orchestrator: WindowOrchestrator;
  }
) {
  const { orchestrator } = deps;

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
}

