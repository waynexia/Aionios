import type { WindowRevisionSummary } from '../types';

interface RevisionListItemProps {
  revision: WindowRevisionSummary;
  currentRevision: number;
  disablePromptActions: boolean;
  disableMutatingRevisionActions: boolean;
  rollingBackTo: number | null;
  branchingRevision: number | null;
  regeneratingRevision: number | null;
  onViewPrompt: (revision: number) => void;
  onRegenerateRevision: (revision: number) => void;
  onBranchRevision: (revision: number) => void;
  onRollbackRevision: (revision: number) => void;
  formatGeneratedAt: (value: string) => string;
}

export function RevisionListItem({
  revision,
  currentRevision,
  disablePromptActions,
  disableMutatingRevisionActions,
  rollingBackTo,
  branchingRevision,
  regeneratingRevision,
  onViewPrompt,
  onRegenerateRevision,
  onBranchRevision,
  onRollbackRevision,
  formatGeneratedAt
}: RevisionListItemProps) {
  const isCurrent = revision.revision === currentRevision;

  return (
    <article
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
          <span className="revision-dialog__time">
            {formatGeneratedAt(revision.generatedAt)}
          </span>
        </div>
      </div>
      <div className="revision-dialog__actions">
        <button
          type="button"
          className="revision-dialog__button revision-dialog__button--ghost"
          data-revision-prompt={revision.revision}
          disabled={disablePromptActions}
          onClick={() => {
            onViewPrompt(revision.revision);
          }}
        >
          View prompt
        </button>
        <button
          type="button"
          className="revision-dialog__button revision-dialog__button--ghost"
          data-revision-regenerate={revision.revision}
          disabled={disableMutatingRevisionActions}
          onClick={() => {
            onRegenerateRevision(revision.revision);
          }}
        >
          {regeneratingRevision === revision.revision ? 'Regenerating...' : 'Regenerate'}
        </button>
        <button
          type="button"
          className="revision-dialog__button revision-dialog__button--ghost"
          data-revision-branch={revision.revision}
          disabled={disablePromptActions}
          onClick={() => {
            onBranchRevision(revision.revision);
          }}
        >
          {branchingRevision === revision.revision ? 'Branching...' : 'Branch'}
        </button>
        <button
          type="button"
          className="revision-dialog__button"
          data-revision-rollback={revision.revision}
          disabled={isCurrent || disableMutatingRevisionActions}
          onClick={() => {
            onRollbackRevision(revision.revision);
          }}
        >
          {rollingBackTo === revision.revision ? 'Rolling back...' : 'Rollback'}
        </button>
      </div>
    </article>
  );
}
