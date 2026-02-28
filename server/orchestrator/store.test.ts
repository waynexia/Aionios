import { describe, expect, it } from 'vitest';
import { getSystemModuleSource } from './system-modules';
import { SessionStore } from './store';
import { validateGeneratedSource } from './validator';

function createStoreWithWindow() {
  const store = new SessionStore();
  store.createWindow({
    sessionId: 'session-a',
    windowId: 'window-1',
    appId: 'notes',
    title: 'Notes'
  });
  return store;
}

describe('SessionStore', () => {
  it('tracks revisions and rollback per window', () => {
    const store = createStoreWithWindow();
    const revisionOne = store.addRevision(
      'session-a',
      'window-1',
      'source-one',
      'prompt-one',
      'mock',
      'remount'
    );
    const revisionTwo = store.addRevision(
      'session-a',
      'window-1',
      'source-two',
      'prompt-two',
      'mock',
      'hmr'
    );

    expect(revisionOne.revision).toBe(1);
    expect(revisionTwo.revision).toBe(2);
    expect(store.getWindowSource('session-a', 'window-1')).toEqual({
      revision: 2,
      source: 'source-two'
    });

    const rolled = store.rollbackToRevision('session-a', 'window-1', 1);
    expect(rolled.revision).toBe(1);
    expect(store.getWindowSource('session-a', 'window-1')).toEqual({
      revision: 1,
      source: 'source-one'
    });
  });

  it('caps context entries to 30 records', () => {
    const store = createStoreWithWindow();
    for (let index = 0; index < 40; index += 1) {
      store.addContextEntry('session-a', 'window-1', {
        role: 'user',
        content: `message ${index}`,
        createdAt: new Date().toISOString()
      });
    }

    const windowRecord = store.getWindow('session-a', 'window-1');
    expect(windowRecord).toBeDefined();
    expect(windowRecord?.context).toHaveLength(30);
    expect(windowRecord?.context[0]?.content).toBe('message 10');
  });
});

describe('validateGeneratedSource', () => {
  it('accepts valid generated module', async () => {
    const result = await validateGeneratedSource(`
import { useState } from 'react';

type WindowProps = {
  host: { requestUpdate: (instruction: string) => Promise<void> };
  windowState: { title: string };
};

export default function WindowApp({ host, windowState }: WindowProps) {
  const [count, setCount] = useState(0);
  return <button onClick={() => {
    setCount((value) => value + 1);
    void host.requestUpdate(windowState.title);
  }}>{count}</button>;
}
`);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects disallowed imports', async () => {
    const result = await validateGeneratedSource(`
import fs from 'node:fs';
export default function WindowApp() { return <div />; }
`);
    expect(result.valid).toBe(false);
    expect(result.issues.join('\n')).toContain('Disallowed import');
  });
});

describe('system modules', () => {
  it('provides terminal system app source', () => {
    const source = getSystemModuleSource('terminal');
    expect(source).toBeDefined();
    expect(source).toContain('export default function WindowApp');
    expect(source).toContain('host.terminal.sendInput');
  });
});
