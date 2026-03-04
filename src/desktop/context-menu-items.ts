import type { AppDefinition, PersistedAppDescriptor } from '../types';
import type { ContextMenuItem } from '../components/ContextMenu';
import {
  dispatchDirectoryNewFile,
  dispatchFsChanged,
  dispatchRecycleBinAction
} from '../aionios-events';

export type DesktopContextMenuState =
  | { kind: 'desktop'; x: number; y: number; directory: string }
  | { kind: 'directory'; x: number; y: number; directory: string; windowId: string }
  | { kind: 'recycle-bin'; x: number; y: number; windowId: string }
  | { kind: 'recycle-bin-item'; x: number; y: number; windowId: string; itemId: string; originalPath: string }
  | { kind: 'icon'; x: number; y: number; appId: string }
  | { kind: 'file'; x: number; y: number; path: string };

export function buildDesktopContextMenuItems(options: {
  contextMenu: DesktopContextMenuState | null;
  openApp: (appId: string) => Promise<void>;
  openFile: (virtualPath: string) => Promise<void>;
  refreshPersistedApps: () => Promise<void>;
  trashVirtualPath: (virtualPath: string) => Promise<void>;
  resolveAppDefinition: (appId: string) => AppDefinition | undefined;
  persistedAppDescriptorById: Map<string, PersistedAppDescriptor>;
  onCreateNewApp: (directory: string) => void;
  onOpenWithPrompt: (input: { appId: string; title: string; hint: string }) => void;
}): ContextMenuItem[] {
  const {
    contextMenu,
    onCreateNewApp,
    onOpenWithPrompt,
    openApp,
    openFile,
    persistedAppDescriptorById,
    refreshPersistedApps,
    resolveAppDefinition,
    trashVirtualPath
  } = options;

  if (!contextMenu) {
    return [];
  }

  if (contextMenu.kind === 'desktop') {
    const directory = contextMenu.directory;
    return [
      {
        id: 'refresh',
        label: 'Refresh',
        onSelect: () => {
          void refreshPersistedApps();
        }
      },
      {
        id: 'create',
        label: 'Create New',
        onSelect: () => onCreateNewApp(directory)
      },
      { id: 'delete', label: 'Delete', disabled: true }
    ];
  }

  if (contextMenu.kind === 'directory') {
    const directory = contextMenu.directory;
    return [
      {
        id: 'refresh',
        label: 'Refresh',
        onSelect: () => {
          dispatchFsChanged({ action: 'refresh', path: directory });
          void refreshPersistedApps();
        }
      },
      {
        id: 'new-file',
        label: 'New File',
        onSelect: () => {
          dispatchDirectoryNewFile({ windowId: contextMenu.windowId, directory });
        }
      },
      {
        id: 'create',
        label: 'Create New',
        onSelect: () => onCreateNewApp(directory)
      },
      { id: 'delete', label: 'Delete', disabled: true }
    ];
  }

  if (contextMenu.kind === 'recycle-bin') {
    return [
      {
        id: 'refresh',
        label: 'Refresh',
        onSelect: () => {
          dispatchRecycleBinAction({ windowId: contextMenu.windowId, action: 'refresh' });
        }
      },
      {
        id: 'empty',
        label: 'Empty Recycle Bin',
        onSelect: () => {
          dispatchRecycleBinAction({ windowId: contextMenu.windowId, action: 'empty' });
        }
      }
    ];
  }

  if (contextMenu.kind === 'recycle-bin-item') {
    return [
      {
        id: 'restore',
        label: 'Restore',
        onSelect: () => {
          dispatchRecycleBinAction({
            windowId: contextMenu.windowId,
            action: 'restore',
            itemId: contextMenu.itemId
          });
        }
      },
      {
        id: 'delete-permanently',
        label: 'Delete Permanently',
        onSelect: () => {
          dispatchRecycleBinAction({
            windowId: contextMenu.windowId,
            action: 'delete',
            itemId: contextMenu.itemId,
            originalPath: contextMenu.originalPath
          });
        }
      }
    ];
  }

  if (contextMenu.kind === 'file') {
    const filePath = contextMenu.path;
    return [
      {
        id: 'open',
        label: 'Open',
        onSelect: () => {
          void openFile(filePath);
        }
      },
      {
        id: 'delete',
        label: 'Delete',
        onSelect: () => {
          void trashVirtualPath(filePath);
        }
      },
      {
        id: 'open-recycle-bin',
        label: 'Open Recycle Bin',
        onSelect: () => {
          void openApp('recycle-bin');
        }
      }
    ];
  }

  const definition = resolveAppDefinition(contextMenu.appId);
  const items: ContextMenuItem[] = [
    {
      id: 'open',
      label: `Open ${definition?.title ?? contextMenu.appId}`,
      onSelect: () => {
        void openApp(contextMenu.appId);
      }
    }
  ];

  if (definition?.kind === 'llm' && !contextMenu.appId.startsWith('app-')) {
    items.push({
      id: 'open-with-prompt',
      label: 'Open with prompt…',
      onSelect: () => {
        onOpenWithPrompt({
          appId: contextMenu.appId,
          title: definition.title,
          hint: definition.hint
        });
      }
    });
  }

  const descriptor = persistedAppDescriptorById.get(contextMenu.appId);
  items.push({
    id: 'delete',
    label: 'Delete',
    disabled: !descriptor,
    onSelect: descriptor
      ? () => {
          void trashVirtualPath(descriptor.path);
        }
      : undefined
  });
  return items;
}
