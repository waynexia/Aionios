import { describe, expect, it } from 'vitest';
import { DIRECTORY_WINDOW_SOURCE } from './directory';

describe('directory system app source', () => {
  it('exports a window module with host-backed file operations', () => {
    expect(DIRECTORY_WINDOW_SOURCE).toContain('export default function WindowApp');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('host.listFiles');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('host.readFile');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('host.writeFile');
  });

  it('includes stable testing hooks', () => {
    expect(DIRECTORY_WINDOW_SOURCE).toContain('data-directory-app');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('data-directory-list');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('data-directory-selected');
    expect(DIRECTORY_WINDOW_SOURCE).toContain('data-directory-save');
  });
});
