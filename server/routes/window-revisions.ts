import type { Express } from 'express';
import { badRequest, notFound } from '../http/responses';
import { parseNonEmptyString, parsePositiveInteger } from '../http/validation';
import { WindowOrchestrator } from '../orchestrator';

export function registerWindowRevisionRoutes(
  app: Express,
  deps: {
    orchestrator: WindowOrchestrator;
  }
) {
  const { orchestrator } = deps;

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions', (request, response) => {
    const { sessionId, windowId } = request.params;
    try {
      response.status(200).json({
        revisions: orchestrator.listWindowRevisions(sessionId, windowId)
      });
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions/:revision', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = parsePositiveInteger(request.params.revision);
    if (!parsedRevision) {
      badRequest(response, 'revision must be a positive integer.');
      return;
    }
    try {
      response.status(200).json(orchestrator.getWindowRevision(sessionId, windowId, parsedRevision));
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });

  app.get('/api/sessions/:sessionId/windows/:windowId/revisions/:revision/prompt', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = parsePositiveInteger(request.params.revision);
    if (!parsedRevision) {
      badRequest(response, 'revision must be a positive integer.');
      return;
    }
    try {
      response
        .status(200)
        .json(orchestrator.getWindowRevisionPrompt(sessionId, windowId, parsedRevision));
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/revisions/:revision/branch', (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = parsePositiveInteger(request.params.revision);
    const { newWindowId: newWindowIdValue, title } = request.body as {
      newWindowId?: string;
      title?: unknown;
    };
    if (!parsedRevision) {
      badRequest(response, 'revision must be a positive integer.');
      return;
    }
    const newWindowId = parseNonEmptyString(newWindowIdValue);
    if (!newWindowId) {
      badRequest(response, 'newWindowId is required.');
      return;
    }
    const normalizedTitle = parseNonEmptyString(title)?.trim();
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
      notFound(response, (error as Error).message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/revisions/:revision/regenerate', async (request, response) => {
    const { sessionId, windowId } = request.params;
    const parsedRevision = parsePositiveInteger(request.params.revision);
    if (!parsedRevision) {
      badRequest(response, 'revision must be a positive integer.');
      return;
    }
    try {
      const snapshot = await orchestrator.regenerateWindowRevision(sessionId, windowId, parsedRevision);
      response.status(202).json(snapshot);
    } catch (error) {
      notFound(response, (error as Error).message);
    }
  });
}
