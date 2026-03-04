import { type Response } from 'express';
import { WindowOrchestrator } from '../orchestrator';
import { badRequest } from './responses';

export function requireTerminalWindowSnapshot(
  orchestrator: WindowOrchestrator,
  response: Response,
  sessionId: string,
  windowId: string
): ReturnType<WindowOrchestrator['getWindowSnapshot']> | null {
  const snapshot = orchestrator.getWindowSnapshot(sessionId, windowId);
  if (snapshot.appId !== 'terminal') {
    badRequest(response, 'Terminal API is only available for terminal windows.');
    return null;
  }
  return snapshot;
}
