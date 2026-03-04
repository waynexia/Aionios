export const FS_CHANGED_EVENT = 'aionios:fs-changed' as const;
export type FsChangedDetail = { action: 'refresh' | 'trash' | 'restore'; path: string };

export function dispatchFsChanged(detail: FsChangedDetail) {
  window.dispatchEvent(new CustomEvent(FS_CHANGED_EVENT, { detail }));
}

export const DIRECTORY_NEW_FILE_EVENT = 'aionios:directory-new-file' as const;
export type DirectoryNewFileDetail = { windowId: string; directory: string };

export function dispatchDirectoryNewFile(detail: DirectoryNewFileDetail) {
  window.dispatchEvent(new CustomEvent(DIRECTORY_NEW_FILE_EVENT, { detail }));
}

export const RECYCLE_BIN_ACTION_EVENT = 'aionios:recycle-bin-action' as const;
export type RecycleBinActionDetail =
  | { windowId: string; action: 'refresh' | 'empty' }
  | { windowId: string; action: 'restore'; itemId: string }
  | { windowId: string; action: 'delete'; itemId: string; originalPath: string };

export function dispatchRecycleBinAction(detail: RecycleBinActionDetail) {
  window.dispatchEvent(new CustomEvent(RECYCLE_BIN_ACTION_EVENT, { detail }));
}

