import { describe, expect, it } from 'vitest';
import { RECYCLE_BIN_WINDOW_SOURCE } from './recycle-bin';

describe('recycle bin system app source', () => {
  it('exports a window module with host-backed recycle bin operations', () => {
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('export default function WindowApp');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('host.recycleBin.listItems');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('host.recycleBin.restore');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('host.recycleBin.deleteItem');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('host.recycleBin.empty');
  });

  it('includes stable testing hooks', () => {
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('data-recycle-bin-app');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('data-recycle-bin-list');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('data-recycle-bin-empty');
    expect(RECYCLE_BIN_WINDOW_SOURCE).toContain('data-recycle-bin-status');
  });
});

