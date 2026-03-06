import { useEffect } from 'react';
import { createSession, listSessionWindows } from '../api/client';
import type { AppAction } from '../state/app-state';

const SESSION_STORAGE_KEY = 'aionios:sessionId';

export function useSessionBootstrap(options: { dispatch: (action: AppAction) => void }) {
  const { dispatch } = options;

  useEffect(() => {
    let active = true;

    const restoreWindows = async (sessionId: string) => {
      try {
        const { windows } = await listSessionWindows({ sessionId });
        if (!active) {
          return;
        }
        for (const snapshot of windows) {
          dispatch({
            type: 'window-open-local',
            windowId: snapshot.windowId,
            sessionId: snapshot.sessionId,
            appId: snapshot.appId,
            title: snapshot.title,
            generationSelection: snapshot.generationSelection,
            initialStatus: snapshot.status,
            initialRevision: snapshot.revision,
            initialError: snapshot.error
          });
        }
      } catch (error) {
        console.warn('[aionios] unable to restore session windows', error);
      }
    };

    const existingSessionId = (() => {
      try {
        return sessionStorage.getItem(SESSION_STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    if (existingSessionId && existingSessionId.trim().length > 0) {
      dispatch({ type: 'session-ready', sessionId: existingSessionId });
      void restoreWindows(existingSessionId);
      return () => {
        active = false;
      };
    }

    void createSession()
      .then(({ sessionId }) => {
        if (!active) {
          return;
        }
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        } catch {
          // ignore storage failures
        }
        dispatch({ type: 'session-ready', sessionId });
        void restoreWindows(sessionId);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        dispatch({
          type: 'session-error',
          message: (error as Error).message
        });
      });
    return () => {
      active = false;
    };
  }, [dispatch]);
}
