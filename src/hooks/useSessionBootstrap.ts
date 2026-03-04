import { useEffect } from 'react';
import { createSession } from '../api/client';
import type { AppAction } from '../state/app-state';

export function useSessionBootstrap(options: { dispatch: (action: AppAction) => void }) {
  const { dispatch } = options;

  useEffect(() => {
    let active = true;
    void createSession()
      .then(({ sessionId }) => {
        if (!active) {
          return;
        }
        dispatch({ type: 'session-ready', sessionId });
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

