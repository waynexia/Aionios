import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DESCRIPTOR_EXTENSION,
  createAppDescriptor,
  listAppDescriptors
} from './app-descriptors';
import { HostFileSystem } from './host-fs';

async function createHostFs() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionios-host-fs-test-'));
  return new HostFileSystem({ rootDir });
}

describe('app descriptors', () => {
  it('lists valid descriptors and supports directory filtering', async () => {
    const hostFs = await createHostFs();
    await createAppDescriptor(hostFs, {
      directory: '/',
      appId: 'app-root',
      title: 'Root App'
    });
    await createAppDescriptor(hostFs, {
      directory: '/tools',
      appId: 'app-tools',
      title: 'Tools App'
    });
    await hostFs.writeFile(
      `broken${APP_DESCRIPTOR_EXTENSION}`,
      JSON.stringify({ kind: 'aionios.app', version: 1, title: 'Missing fields' })
    );

    const all = await listAppDescriptors(hostFs);
    expect(all.map((entry) => entry.appId)).toEqual(['app-root', 'app-tools']);

    const rootOnly = await listAppDescriptors(hostFs, { directory: '/' });
    expect(rootOnly.map((entry) => entry.appId)).toEqual(['app-root']);

    const toolsOnly = await listAppDescriptors(hostFs, { directory: '/tools' });
    expect(toolsOnly.map((entry) => entry.appId)).toEqual(['app-tools']);
  });
});
