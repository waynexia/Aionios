interface RevisionPromptPanelProps {
  promptRevision: number;
  currentRevision: number;
  promptLoaded: string;
  promptDraft: string;
  promptError: string | null;
  promptLoading: boolean;
  promptEditing: boolean;
  promptSubmitting: boolean;
  setPromptDraft: (value: string) => void;
  onCopyPrompt: () => void;
  onResetPrompt: () => void;
  onStartPromptEditing: () => void;
  onRegenerateFromPrompt: () => void;
  onClosePromptViewer: () => void;
}

export function RevisionPromptPanel({
  promptRevision,
  currentRevision,
  promptLoaded,
  promptDraft,
  promptError,
  promptLoading,
  promptEditing,
  promptSubmitting,
  setPromptDraft,
  onCopyPrompt,
  onResetPrompt,
  onStartPromptEditing,
  onRegenerateFromPrompt,
  onClosePromptViewer
}: RevisionPromptPanelProps) {
  const canEditCurrentRevision = promptRevision === currentRevision;
  const canCopyPrompt = !promptLoading && !promptSubmitting && Boolean(promptDraft);
  const canResetPrompt =
    !promptLoading && !promptSubmitting && promptDraft !== promptLoaded;
  const canRegeneratePrompt =
    !promptLoading && !promptSubmitting && promptDraft.trim().length > 0;

  return (
    <section className="revision-dialog__prompt" data-revision-prompt-viewer>
      <header className="revision-dialog__prompt-header">
        <strong>Prompt · rev {promptRevision}</strong>
        <div className="revision-dialog__prompt-actions">
          <button
            type="button"
            className="revision-dialog__button revision-dialog__button--ghost"
            disabled={!canCopyPrompt}
            onClick={() => {
              onCopyPrompt();
            }}
          >
            Copy
          </button>
          {canEditCurrentRevision ? (
            promptEditing ? (
              <>
                <button
                  type="button"
                  className="revision-dialog__button revision-dialog__button--ghost"
                  data-revision-prompt-reset
                  disabled={!canResetPrompt}
                  onClick={() => {
                    onResetPrompt();
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="revision-dialog__button"
                  data-revision-prompt-regenerate
                  disabled={!canRegeneratePrompt}
                  onClick={() => {
                    onRegenerateFromPrompt();
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
                  onStartPromptEditing();
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
              onClosePromptViewer();
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
  );
}
