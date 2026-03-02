import { useEffect, useMemo, useRef } from 'react';
import type { ClientWindowStatus } from '../types';

interface LlmOutputDialogProps {
  open: boolean;
  windowId: string;
  title: string;
  windowStatus: ClientWindowStatus;
  output: string;
  onClose: () => void;
  onClear: () => void;
}

export function LlmOutputDialog({
  open,
  windowId,
  title,
  windowStatus,
  output,
  onClose,
  onClear
}: LlmOutputDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedOutput = useMemo(() => output ?? '', [output]);

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
    textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const distanceFromBottom = textarea.scrollHeight - textarea.scrollTop - textarea.clientHeight;
    if (distanceFromBottom < 40) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [normalizedOutput, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="llm-output-dialog-overlay"
      data-llm-output-dialog-overlay
      onPointerDown={() => onClose()}
    >
      <div
        className="llm-output-dialog"
        data-llm-output-dialog
        role="dialog"
        aria-modal="true"
        aria-label={`LLM output for ${title}`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="llm-output-dialog__header">
          <div className="llm-output-dialog__heading">
            <strong>LLM Output</strong>
            <span className="llm-output-dialog__title">
              {title} · {windowId} · {windowStatus}
            </span>
          </div>
          <button
            type="button"
            className="llm-output-dialog__close"
            data-llm-output-close
            aria-label="Close LLM output"
            onClick={() => onClose()}
          >
            ×
          </button>
        </header>

        <p className="llm-output-dialog__description">
          Streams backend stdout/stderr while generating (enable in Preference → “Stream backend output”).
        </p>

        <textarea
          ref={textareaRef}
          className="llm-output-dialog__textarea"
          readOnly
          spellCheck={false}
          value={normalizedOutput}
          placeholder="No output yet."
        />

        <footer className="llm-output-dialog__actions">
          <button
            type="button"
            className="llm-output-dialog__button llm-output-dialog__button--ghost"
            data-llm-output-clear
            disabled={!normalizedOutput}
            onClick={() => onClear()}
          >
            Clear
          </button>
          <button
            type="button"
            className="llm-output-dialog__button"
            onClick={() => onClose()}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

