import { useCallback, useMemo, useState } from 'react';

export type PromptDialogState =
  | { mode: 'update'; windowId: string; title: string }
  | { mode: 'open'; appId: string; title: string; hint: string }
  | { mode: 'create'; directory: string };

export function usePromptDialogController(options: {
  openApp: (appId: string, instruction?: string) => Promise<void>;
  createNewApp: (instruction: string, directory: string) => Promise<void>;
  requestUpdateForWindow: (windowId: string, instruction: string) => Promise<void>;
}) {
  const { createNewApp, openApp, requestUpdateForWindow } = options;
  const [promptDialog, setPromptDialog] = useState<PromptDialogState | null>(null);

  const openCreateDialog = useCallback((directory: string) => {
    setPromptDialog({ mode: 'create', directory });
  }, []);

  const openOpenDialog = useCallback((input: { appId: string; title: string; hint: string }) => {
    setPromptDialog({ mode: 'open', ...input });
  }, []);

  const openUpdateDialog = useCallback((input: { windowId: string; title: string }) => {
    setPromptDialog({ mode: 'update', ...input });
  }, []);

  const closePromptDialog = useCallback(() => {
    setPromptDialog(null);
  }, []);

  const promptDialogProps = useMemo(() => {
    if (promptDialog?.mode === 'create') {
      return {
        title: `Create New (save to ${promptDialog.directory})`,
        description:
          `Describe what you want to create. Aionios will choose a file extension (apps use .app; other common types include .svg, .md, .txt). ` +
          `It will be saved in ${promptDialog.directory}.`,
        placeholder: 'E.g. A kanban board app, a simple SVG icon, or a markdown slide deck.',
        initialValue: '',
        confirmLabel: 'Create'
      };
    }

    if (promptDialog?.mode === 'open') {
      return {
        title: `Open “${promptDialog.title}” with a prompt`,
        description: 'Describe what you want this new window to be.',
        placeholder: promptDialog.hint,
        initialValue: promptDialog.hint,
        confirmLabel: 'Open'
      };
    }

    if (promptDialog?.mode === 'update') {
      return {
        title: `Ask LLM to update “${promptDialog.title}”`,
        description: 'Describe what you want to change in this window.',
        placeholder: 'E.g. Add a sidebar, improve styling, and add keyboard shortcuts.',
        initialValue: '',
        confirmLabel: 'Update'
      };
    }

    return {
      title: 'Ask LLM',
      description: 'Describe what you want to change in this window.',
      placeholder: 'E.g. Add a sidebar, improve styling, and add keyboard shortcuts.',
      initialValue: '',
      confirmLabel: 'Update'
    };
  }, [promptDialog]);

  const onConfirmPrompt = useCallback(
    (instruction: string) => {
      if (!promptDialog) {
        return;
      }
      if (promptDialog.mode === 'create') {
        void createNewApp(instruction, promptDialog.directory);
      } else if (promptDialog.mode === 'open') {
        void openApp(promptDialog.appId, instruction);
      } else {
        void requestUpdateForWindow(promptDialog.windowId, instruction);
      }
      setPromptDialog(null);
    },
    [createNewApp, openApp, promptDialog, requestUpdateForWindow]
  );

  return {
    promptDialog,
    openCreateDialog,
    openOpenDialog,
    openUpdateDialog,
    closePromptDialog,
    onConfirmPrompt,
    promptDialogProps
  };
}
