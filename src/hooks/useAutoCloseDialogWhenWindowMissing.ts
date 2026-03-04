import { useEffect } from 'react';

export function useAutoCloseDialogWhenWindowMissing<T extends { windowId: string }>(options: {
  windows: readonly { windowId: string }[];
  dialog: T | null;
  setDialog: (next: T | null) => void;
}) {
  const { windows, dialog, setDialog } = options;

  useEffect(() => {
    if (!dialog) {
      return;
    }
    if (windows.some((windowItem) => windowItem.windowId === dialog.windowId)) {
      return;
    }
    setDialog(null);
  }, [dialog, setDialog, windows]);
}

