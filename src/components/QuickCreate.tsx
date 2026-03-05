import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface QuickCreateProps {
  open: boolean;
  placeholder?: string;
  onConfirm: (instruction: string) => void;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function QuickCreate({
  open,
  placeholder = 'Describe what you want to create…',
  onConfirm,
  onClose
}: QuickCreateProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');

  const resizeTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = '0px';
    element.style.height = `${clamp(element.scrollHeight, 34, 160)}px`;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue('');
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    textareaRef.current?.focus();
    resizeTextarea();
  }, [open, resizeTextarea]);

  useEffect(() => {
    if (!open) {
      return;
    }
    resizeTextarea();
  }, [open, resizeTextarea, value]);

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
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const trimmed = useMemo(() => value.trim(), [value]);
  const canConfirm = trimmed.length > 0;

  if (!open) {
    return null;
  }

  return (
    <div className="quick-create-overlay" data-quick-create-overlay onPointerDown={() => onClose()}>
      <form
        className="quick-create"
        data-quick-create
        role="dialog"
        aria-modal="true"
        aria-label="Quick create"
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canConfirm) {
            return;
          }
          onConfirm(trimmed);
          onClose();
        }}
      >
        <textarea
          ref={textareaRef}
          className="quick-create__textarea"
          data-quick-create-textarea
          rows={1}
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              const nextValue = value.trim();
              if (!nextValue) {
                return;
              }
              onConfirm(nextValue);
              onClose();
            }
          }}
        />
        <button
          type="submit"
          className="quick-create__submit"
          data-quick-create-submit
          disabled={!canConfirm}
        >
          Create
        </button>
      </form>
    </div>
  );
}

