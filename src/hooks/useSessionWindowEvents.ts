import { useEffect } from 'react';
import type { AppAction } from '../state/app-state';
import type { ServerWindowEvent } from '../types';

export function useSessionWindowEvents(options: {
  sessionId: string | undefined;
  dispatch: (action: AppAction) => void;
}) {
  const { sessionId, dispatch } = options;

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const events = new EventSource(`/api/sessions/${sessionId}/events`);
    const listener = (rawEvent: MessageEvent<string>) => {
      const event = JSON.parse(rawEvent.data) as ServerWindowEvent;
      dispatch({
        type: 'window-server-event',
        event
      });
    };

    const eventTypes: ServerWindowEvent['type'][] = [
      'window-status',
      'window-ready',
      'window-updated',
      'window-error',
      'window-remount',
      'terminal-status',
      'terminal-output',
      'terminal-exit',
      'llm-output'
    ];

    for (const type of eventTypes) {
      events.addEventListener(type, listener as EventListener);
    }

    events.onerror = () => {
      console.warn('[aionios] event stream disconnected');
    };

    return () => {
      for (const type of eventTypes) {
        events.removeEventListener(type, listener as EventListener);
      }
      events.close();
    };
  }, [dispatch, sessionId]);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }

    const handler = (payload: { sessionId: string; windowId: string }) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      dispatch({
        type: 'window-server-event',
        event: {
          type: 'window-remount',
          sessionId: payload.sessionId,
          windowId: payload.windowId
        }
      });
    };

    import.meta.hot.on('aionios:window-remount', handler);
    return () => {
      import.meta.hot?.off('aionios:window-remount', handler);
    };
  }, [dispatch, sessionId]);
}
