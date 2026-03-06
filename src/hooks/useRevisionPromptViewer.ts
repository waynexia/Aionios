import { useCallback, useEffect, useState } from 'react';
import {
  getWindowRevisionPrompt,
  requestWindowPromptUpdate
} from '../api/client';

export function useRevisionPromptViewer(options: {
  open: boolean;
  sessionId: string;
  windowId: string;
}) {
  const { open, sessionId, windowId } = options;
  const [promptRevision, setPromptRevision] = useState<number | null>(null);
  const [promptLoaded, setPromptLoaded] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptEditing, setPromptEditing] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);

  const closePromptViewer = useCallback(() => {
    setPromptRevision(null);
    setPromptLoaded('');
    setPromptDraft('');
    setPromptError(null);
    setPromptEditing(false);
    setPromptSubmitting(false);
  }, []);

  useEffect(() => {
    if (open) {
      return;
    }
    closePromptViewer();
    setPromptLoading(false);
  }, [closePromptViewer, open]);

  const viewPrompt = useCallback(
    async (revision: number) => {
      setPromptLoading(true);
      setPromptError(null);
      setPromptEditing(false);
      setPromptSubmitting(false);
      try {
        const detail = await getWindowRevisionPrompt({ sessionId, windowId, revision });
        setPromptRevision(detail.revision);
        setPromptLoaded(detail.prompt);
        setPromptDraft(detail.prompt);
      } catch (reason) {
        setPromptError((reason as Error).message);
        setPromptRevision(revision);
        setPromptLoaded('');
        setPromptDraft('');
      } finally {
        setPromptLoading(false);
      }
    },
    [sessionId, windowId]
  );

  const copyPrompt = useCallback(async () => {
    if (!promptDraft) {
      return;
    }
    try {
      await navigator.clipboard.writeText(promptDraft);
    } catch (reason) {
      setPromptError((reason as Error).message);
    }
  }, [promptDraft]);

  const resetPrompt = useCallback(() => {
    setPromptDraft(promptLoaded);
    setPromptError(null);
  }, [promptLoaded]);

  const startPromptEditing = useCallback(() => {
    setPromptEditing(true);
    setPromptError(null);
  }, []);

  const regenerateFromPrompt = useCallback(async () => {
    if (promptRevision === null) {
      return;
    }
    setPromptSubmitting(true);
    setPromptError(null);
    try {
      await requestWindowPromptUpdate({
        sessionId,
        windowId,
        prompt: promptDraft
      });
      setPromptEditing(false);
    } catch (reason) {
      setPromptError((reason as Error).message);
    } finally {
      setPromptSubmitting(false);
    }
  }, [promptDraft, promptRevision, sessionId, windowId]);

  return {
    promptRevision,
    promptLoaded,
    promptDraft,
    promptError,
    promptLoading,
    promptEditing,
    promptSubmitting,
    setPromptDraft,
    viewPrompt,
    copyPrompt,
    closePromptViewer,
    resetPrompt,
    startPromptEditing,
    regenerateFromPrompt
  };
}
