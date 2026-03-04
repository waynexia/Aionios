import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listWindowRevisions, rollbackWindow } from '../api/client';
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
  }, [open, refresh]);

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
      </div>
    </div>
  );
}
