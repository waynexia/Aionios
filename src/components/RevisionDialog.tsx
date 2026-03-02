import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getWindowRevisionPrompt,
  listWindowRevisions,
  requestWindowPromptUpdate,
  rollbackWindow
} from '../api/client';
import type { WindowRevisionSummary } from '../types';

interface RevisionDialogProps {
  open: boolean;
  sessionId: string;
  windowId: string;
  title: string;
  currentRevision: number;
  onClose: () => void;
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
  onClose
}: RevisionDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState<WindowRevisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rollingBackTo, setRollingBackTo] = useState<number | null>(null);
  const [promptRevision, setPromptRevision] = useState<number | null>(null);
  const [promptLoaded, setPromptLoaded] = useState<string>('');
  const [promptDraft, setPromptDraft] = useState<string>('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptEditing, setPromptEditing] = useState(false);
  const [promptSubmitting, setPromptSubmitting] = useState(false);

  const orderedRevisions = useMemo(() => sortByRevisionDesc(revisions), [revisions]);
  const hasRevisions = orderedRevisions.length > 0;

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
    setPromptRevision(null);
    setPromptLoaded('');
    setPromptDraft('');
    setPromptError(null);
    setPromptLoading(false);
    setPromptEditing(false);
    setPromptSubmitting(false);
  }, [open]);

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

  const closePromptViewer = useCallback(() => {
    setPromptRevision(null);
    setPromptLoaded('');
    setPromptDraft('');
    setPromptError(null);
    setPromptEditing(false);
    setPromptSubmitting(false);
  }, []);

  const resetPrompt = useCallback(() => {
    setPromptDraft(promptLoaded);
    setPromptError(null);
  }, [promptLoaded]);

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
              const isCurrent = revision.revision === currentRevision;
              return (
                <article
                  key={revision.revision}
                  className={`revision-dialog__item${isCurrent ? ' revision-dialog__item--current' : ''}`}
                  data-revision-item={revision.revision}
                >
                  <div className="revision-dialog__meta">
                    <div className="revision-dialog__meta-row">
                      <span className="revision-dialog__revision">rev {revision.revision}</span>
                      {isCurrent ? (
                        <span className="revision-dialog__badge" aria-label="Current revision">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <div className="revision-dialog__meta-row revision-dialog__meta-row--secondary">
                      <span className="revision-dialog__tag">{revision.backend}</span>
                      <span className="revision-dialog__tag">{revision.strategy}</span>
                      <span className="revision-dialog__time">{formatGeneratedAt(revision.generatedAt)}</span>
                    </div>
                  </div>
                  <div className="revision-dialog__actions">
                    <button
                      type="button"
                      className="revision-dialog__button revision-dialog__button--ghost"
                      data-revision-prompt={revision.revision}
                      disabled={rollingBackTo !== null || loading}
                      onClick={() => {
                        void viewPrompt(revision.revision);
                      }}
                    >
                      View prompt
                    </button>
                    <button
                      type="button"
                      className="revision-dialog__button"
                      data-revision-rollback={revision.revision}
                      disabled={isCurrent || rollingBackTo !== null}
                      onClick={async () => {
                        setRollingBackTo(revision.revision);
                        setError(null);
                        try {
                          await rollbackWindow({
                            sessionId,
                            windowId,
                            revision: revision.revision
                          });
                          await refresh();
                        } catch (reason) {
                          setError((reason as Error).message);
                        } finally {
                          setRollingBackTo(null);
                        }
                      }}
                    >
                      {rollingBackTo === revision.revision ? 'Rolling back...' : 'Rollback'}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {promptRevision !== null ? (
          <section className="revision-dialog__prompt" data-revision-prompt-viewer>
            <header className="revision-dialog__prompt-header">
              <strong>Prompt · rev {promptRevision}</strong>
              <div className="revision-dialog__prompt-actions">
                <button
                  type="button"
                  className="revision-dialog__button revision-dialog__button--ghost"
                  disabled={promptLoading || promptSubmitting || !promptDraft}
                  onClick={() => {
                    void copyPrompt();
                  }}
                >
                  Copy
                </button>
                {promptRevision === currentRevision ? (
                  promptEditing ? (
                    <>
                      <button
                        type="button"
                        className="revision-dialog__button revision-dialog__button--ghost"
                        data-revision-prompt-reset
                        disabled={promptLoading || promptSubmitting || promptDraft === promptLoaded}
                        onClick={() => {
                          resetPrompt();
                        }}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="revision-dialog__button"
                        data-revision-prompt-regenerate
                        disabled={promptLoading || promptSubmitting || promptDraft.trim().length === 0}
                        onClick={() => {
                          void regenerateFromPrompt();
                        }}
                      >
                        {promptSubmitting ? 'Regenerating...' : 'Regenerate'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="revision-dialog__button revision-dialog__button--ghost"
                      data-revision-prompt-edit
                      disabled={promptLoading || promptSubmitting}
                      onClick={() => {
                        setPromptEditing(true);
                        setPromptError(null);
                      }}
                    >
                      Edit
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="revision-dialog__button revision-dialog__button--ghost"
                    data-revision-prompt-edit
                    disabled
                    title="Only the current revision can be edited."
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="revision-dialog__button revision-dialog__button--ghost"
                  data-revision-prompt-close
                  onClick={() => {
                    closePromptViewer();
                  }}
                >
                  Close
                </button>
              </div>
            </header>
            {promptLoading ? (
              <p className="revision-dialog__status">Loading prompt...</p>
            ) : (
              <>
                {promptError ? (
                  <p className="revision-dialog__status revision-dialog__status--error">
                    {promptEditing ? 'Unable to regenerate prompt: ' : 'Unable to load prompt: '}
                    {promptError}
                  </p>
                ) : null}
              <textarea
                className="revision-dialog__prompt-textarea"
                readOnly={!promptEditing}
                value={promptDraft}
                onChange={(event) => {
                  setPromptDraft(event.target.value);
                }}
              />
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
