import type { ServerWindowEvent, ServerWindowSnapshot, UpdateStrategy } from '../types';

export function windowLifecycleEventFromSnapshot(
  snapshot: ServerWindowSnapshot,
  strategy: UpdateStrategy
): ServerWindowEvent {
  return {
    type:
      snapshot.status === 'ready'
        ? 'window-ready'
        : snapshot.status === 'error'
          ? 'window-error'
          : 'window-status',
    sessionId: snapshot.sessionId,
    windowId: snapshot.windowId,
    appId: snapshot.appId,
    title: snapshot.title,
    status: snapshot.status,
    revision: snapshot.revision,
    strategy,
    error: snapshot.error
  };
}

export function windowErrorEvent(input: { sessionId: string; windowId: string; error: string }): ServerWindowEvent {
  return {
    type: 'window-error',
    sessionId: input.sessionId,
    windowId: input.windowId,
    error: input.error
  };
}

