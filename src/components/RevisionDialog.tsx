import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listWindowRevisions,
  regenerateWindowRevision,
  rollbackWindow
} from '../api/client';
import { RevisionListItem } from './RevisionListItem';
import { RevisionPromptPanel } from './RevisionPromptPanel';
import { useRevisionPromptViewer } from '../hooks/useRevisionPromptViewer';
import type { ClientWindowStatus, WindowRevisionSummary } from '../types';

interface RevisionDialogProps {
  open: boolean;
  sessionId: string;
  windowId: string;
  title: string;
  currentRevision: number;
  windowStatus: ClientWindowStatus;
  onClose: () => void;
  onBranch: (revision: number) => Promise<void>;
}

function sortByRevisionDesc(revisions: WindowRevisionSummary[]) {
  return [...revisions].sort((left, right) => right.revision - left.revision);
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return date.toLocaleString();
}

export function RevisionDialog({
  open,
  sessionId,
  windowId,
  title,
  currentRevision,
  windowStatus,
  onClose,
  onBranch
}: RevisionDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<WindowRevisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rollingBackTo, setRollingBackTo] = useState<number | null>(null);
  const [branchingRevision, setBranchingRevision] = useState<number | null>(null);
  const [regeneratingRevision, setRegeneratingRevision] = useState<number | null>(null);
  const {
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
  } = useRevisionPromptViewer({
    open,
    sessionId,
    windowId
  });

  const orderedRevisions = useMemo(() => sortByRevisionDesc(revisions), [revisions]);
  const hasRevisions = orderedRevisions.length > 0;
  const windowIsLoading = windowStatus === 'loading';
  const hasPendingRevisionAction =
    rollingBackTo !== null || branchingRevision !== null || regeneratingRevision !== null;
  const disablePromptActions = hasPendingRevisionAction || loading;
  const disableMutatingRevisionActions =
    hasPendingRevisionAction || loading || windowIsLoading;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listWindowRevisions({ sessionId, windowId });
      setRevisions(response.revisions);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, windowId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refresh();
  }, [open, refresh, currentRevision]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    setBranchingRevision(null);
    setRegeneratingRevision(null);
  }, [open]);

  const handleRegenerateRevision = useCallback(
    async (revision: number) => {
      setRegeneratingRevision(revision);
      setError(null);
      try {
        await regenerateWindowRevision({
          sessionId,
          windowId,
          revision
        });
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        setRegeneratingRevision(null);
      }
    },
    [sessionId, windowId]
  );

  const handleBranchRevision = useCallback(
    async (revision: number) => {
      setBranchingRevision(revision);
      setError(null);
      try {
        await onBranch(revision);
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        setBranchingRevision(null);
      }
    },
    [onBranch]
  );

  const handleRollbackRevision = useCallback(
    async (revision: number) => {
      setRollingBackTo(revision);
      setError(null);
      try {
        await rollbackWindow({
          sessionId,
          windowId,
          revision
        });
        await refresh();
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        setRollingBackTo(null);
      }
    },
    [refresh, sessionId, windowId]
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="revision-dialog-overlay"
      data-revision-dialog-overlay
      onPointerDown={() => onClose()}
    >
      <div
        ref={dialogRef}
        className="revision-dialog"
        data-revision-dialog
        role="dialog"
        aria-modal="true"
        aria-label={`Revision history for ${title}`}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="revision-dialog__header">
          <div className="revision-dialog__heading">
            <strong>Revision History</strong>
            <span className="revision-dialog__title">{title}</span>
          </div>
          <button
            type="button"
            className="revision-dialog__close"
            aria-label="Close revision history"
            onClick={() => onClose()}
          >
            ×
          </button>
        </header>

        <p className="revision-dialog__description">
          Roll back to a previous revision. This will discard later revisions.
          {windowIsLoading ? ' Rollback is disabled while this window is updating.' : null}
        </p>

        <section className="revision-dialog__list" data-revision-dialog-list>
          {loading ? (
            <p className="revision-dialog__status">Loading revisions...</p>
          ) : error ? (
            <p className="revision-dialog__status revision-dialog__status--error">
              Unable to load revisions: {error}
            </p>
          ) : !hasRevisions ? (
            <p className="revision-dialog__status">No revisions yet.</p>
          ) : (
            orderedRevisions.map((revision) => {
              return (
                <RevisionListItem
                  key={revision.revision}
                  revision={revision}
                  currentRevision={currentRevision}
                  disablePromptActions={disablePromptActions}
                  disableMutatingRevisionActions={disableMutatingRevisionActions}
                  rollingBackTo={rollingBackTo}
                  branchingRevision={branchingRevision}
                  regeneratingRevision={regeneratingRevision}
                  onViewPrompt={(nextRevision) => {
                    void viewPrompt(nextRevision);
                  }}
                  onRegenerateRevision={(nextRevision) => {
                    void handleRegenerateRevision(nextRevision);
                  }}
                  onBranchRevision={(nextRevision) => {
                    void handleBranchRevision(nextRevision);
                  }}
                  onRollbackRevision={(nextRevision) => {
                    void handleRollbackRevision(nextRevision);
                  }}
                  formatGeneratedAt={formatGeneratedAt}
                />
              );
            })
          )}
        </section>

        {promptRevision !== null ? (
          <RevisionPromptPanel
            promptRevision={promptRevision}
            currentRevision={currentRevision}
            promptLoaded={promptLoaded}
            promptDraft={promptDraft}
            promptError={promptError}
            promptLoading={promptLoading}
            promptEditing={promptEditing}
            promptSubmitting={promptSubmitting}
            setPromptDraft={setPromptDraft}
            onCopyPrompt={() => {
              void copyPrompt();
            }}
            onResetPrompt={resetPrompt}
            onStartPromptEditing={startPromptEditing}
            onRegenerateFromPrompt={() => {
              void regenerateFromPrompt();
            }}
            onClosePromptViewer={closePromptViewer}
          />
        ) : null}
      </div>
    </div>
  );
}
