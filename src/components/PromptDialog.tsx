import { useEffect, useMemo, useRef, useState } from 'react';

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requireValue?: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({
  open,
  title,
  description,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  requireValue = true,
  onConfirm,
  onClose
}: PromptDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue(initialValue);
  }, [initialValue, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if ((event.key === 'Enter' && (event.metaKey || event.ctrlKey)) || event.key === 'Enter') {
        if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
          return;
        }
        event.preventDefault();
        const trimmed = value.trim();
        if (requireValue && trimmed.length === 0) {
          return;
        }
        onConfirm(trimmed);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, onConfirm, open, requireValue, value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    textareaRef.current?.focus();
  }, [open]);

  const trimmed = useMemo(() => value.trim(), [value]);
  const canConfirm = requireValue ? trimmed.length > 0 : true;

  if (!open) {
    return null;
  }

  return (
    <div
      className="prompt-dialog-overlay"
      data-prompt-dialog-overlay
      onPointerDown={() => onClose()}
    >
      <div
        className="prompt-dialog"
        data-prompt-dialog
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="prompt-dialog__header">
          <strong>{title}</strong>
          {description ? (
            <p className="prompt-dialog__description">{description}</p>
          ) : null}
        </header>
        <textarea
          ref={textareaRef}
          className="prompt-dialog__textarea"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <footer className="prompt-dialog__actions">
          <button
            type="button"
            className="prompt-dialog__button prompt-dialog__button--ghost"
            onClick={() => onClose()}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="prompt-dialog__button prompt-dialog__button--primary"
            disabled={!canConfirm}
            onClick={() => {
              const nextValue = value.trim();
              if (requireValue && nextValue.length === 0) {
                return;
              }
              onConfirm(nextValue);
            }}
          >
            {confirmLabel}
          </button>
        </footer>
        <p className="prompt-dialog__hint">Tip: press Ctrl/⌘ + Enter to submit.</p>
      </div>
    </div>
  );
}

