import type { Express } from 'express';
import { badRequest, notFound } from '../http/responses';
import { parseNonEmptyString } from '../http/validation';
import { WindowOrchestrator } from '../orchestrator';

export function registerWindowActionRoutes(
  app: Express,
  deps: {
    orchestrator: WindowOrchestrator;
  }
) {
  const { orchestrator } = deps;

  app.post('/api/sessions/:sessionId/windows/:windowId/actions', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { instruction } = request.body as { instruction?: string };
    if (!instruction) {
      badRequest(response, 'instruction is required.');
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
      notFound(response, (error as Error).message);
    }
  });

  app.post('/api/sessions/:sessionId/windows/:windowId/actions/prompt', (request, response) => {
    const { sessionId, windowId } = request.params;
    const { prompt: promptValue } = request.body as { prompt?: string };
    const prompt = parseNonEmptyString(promptValue);
    if (!prompt) {
      badRequest(response, 'prompt is required.');
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
      notFound(response, (error as Error).message);
    }
  });
}

