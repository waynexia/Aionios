import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HostFileSystem } from './host-fs';

async function createHostFs() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-host-fs-test-'));
  return new HostFileSystem({ rootDir });
}

describe('HostFileSystem', () => {
  it('lists file metadata without file contents', async () => {
    const hostFs = await createHostFs();
    await hostFs.writeFile('/notes/one.txt', 'hello');
    await hostFs.writeFile('/notes/two.txt', 'world');

    const metadata = await hostFs.listFileMetadata();

    expect(metadata.map((entry) => entry.path)).toEqual([
      'notes/one.txt',
      'notes/two.txt'
    ]);
    expect(metadata.every((entry) => typeof entry.updatedAt === 'string')).toBe(true);
    expect(metadata.some((entry) => 'content' in entry)).toBe(false);
  });
});
