import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HostFileSystem } from './host-fs';
import { RecycleBinStore } from './recycle-bin';

async function createTempDataDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-recycle-bin-test-'));
  return tempDir;
}

const createdDirs: string[] = [];

async function rememberTempDir() {
  const directory = await createTempDataDir();
  createdDirs.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of createdDirs.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe('RecycleBinStore', () => {
  it('trashes and restores host files', async () => {
    const dataDir = await rememberTempDir();
    const hostFs = new HostFileSystem({ rootDir: path.join(dataDir, 'fs') });
    const store = new RecycleBinStore({ rootDir: path.join(dataDir, 'recycle-bin') });

    await hostFs.writeFile('notes/hello.txt', 'hello world');
    const trashed = await store.trashHostFile(hostFs, 'notes/hello.txt');

    expect(trashed.originalPath).toBe('notes/hello.txt');
    expect(await hostFs.fileExists('notes/hello.txt')).toBe(false);
    expect((await store.listItems()).map((item) => item.id)).toContain(trashed.id);

    const restored = await store.restoreItem(hostFs, trashed.id);

    expect(restored.restoredPath).toBe('notes/hello.txt');
    expect(await hostFs.fileExists('notes/hello.txt')).toBe(true);
    expect(await hostFs.readFile('notes/hello.txt')).toBe('hello world');
    expect(await store.listItems()).toHaveLength(0);
  });

  it('restores to a unique path when the original path is taken', async () => {
    const dataDir = await rememberTempDir();
    const hostFs = new HostFileSystem({ rootDir: path.join(dataDir, 'fs') });
    const store = new RecycleBinStore({ rootDir: path.join(dataDir, 'recycle-bin') });

    await hostFs.writeFile('notes/hello.txt', 'original');
    const trashed = await store.trashHostFile(hostFs, 'notes/hello.txt');
    await hostFs.writeFile('notes/hello.txt', 'replacement');

    const restored = await store.restoreItem(hostFs, trashed.id);

    expect(restored.restoredPath).toMatch(/^notes\/hello \(restored( \d+)?\)\.txt$/u);
    expect(await hostFs.readFile('notes/hello.txt')).toBe('replacement');
    expect(await hostFs.readFile(restored.restoredPath)).toBe('original');
  });

  it('preserves compound extensions when restoring with collisions', async () => {
    const dataDir = await rememberTempDir();
    const hostFs = new HostFileSystem({ rootDir: path.join(dataDir, 'fs') });
    const store = new RecycleBinStore({ rootDir: path.join(dataDir, 'recycle-bin') });

    await hostFs.writeFile('apps/My App.aionios-app.json', 'old descriptor');
    const trashed = await store.trashHostFile(hostFs, 'apps/My App.aionios-app.json');
    await hostFs.writeFile('apps/My App.aionios-app.json', 'new descriptor');

    const restored = await store.restoreItem(hostFs, trashed.id);

    expect(restored.restoredPath).toMatch(/^apps\/My App \(restored( \d+)?\)\.aionios-app\.json$/u);
    expect(await hostFs.readFile('apps/My App.aionios-app.json')).toBe('new descriptor');
    expect(await hostFs.readFile(restored.restoredPath)).toBe('old descriptor');
  });

  it('deletes items permanently', async () => {
    const dataDir = await rememberTempDir();
    const hostFs = new HostFileSystem({ rootDir: path.join(dataDir, 'fs') });
    const store = new RecycleBinStore({ rootDir: path.join(dataDir, 'recycle-bin') });

    await hostFs.writeFile('notes/hello.txt', 'hello world');
    const trashed = await store.trashHostFile(hostFs, 'notes/hello.txt');
    expect(await store.listItems()).toHaveLength(1);

    const deleted = await store.deleteItem(trashed.id);
    expect(deleted).toBe(true);
    expect(await store.listItems()).toHaveLength(0);
  });

  it('empties the recycle bin', async () => {
    const dataDir = await rememberTempDir();
    const hostFs = new HostFileSystem({ rootDir: path.join(dataDir, 'fs') });
    const store = new RecycleBinStore({ rootDir: path.join(dataDir, 'recycle-bin') });

    await hostFs.writeFile('notes/a.txt', 'a');
    await hostFs.writeFile('notes/b.txt', 'b');
    await store.trashHostFile(hostFs, 'notes/a.txt');
    await store.trashHostFile(hostFs, 'notes/b.txt');
    expect(await store.listItems()).toHaveLength(2);

    const emptied = await store.empty();
    expect(emptied.emptied).toBe(2);
    expect(await store.listItems()).toHaveLength(0);
  });
});
