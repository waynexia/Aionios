import { describe, expect, it } from 'vitest';
import type { PreferenceConfig } from '../config';
import { WindowOrchestrator } from './service';

const preferenceConfig: PreferenceConfig = {
  llmBackend: 'mock',
  codexCommand: 'codex exec --skip-git-repo-check --output-last-message',
  codexTimeoutMs: 120_000,
  terminalShell: '/bin/sh'
};

function createOrchestrator() {
  return new WindowOrchestrator(() => preferenceConfig);
}

describe('WindowOrchestrator', () => {
  it('opens system apps as ready without async generation', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = orchestrator.openWindow({
      sessionId,
      windowId: 'window-system-terminal',
      appId: 'terminal',
      title: 'Terminal'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);

    const moduleSnapshot = orchestrator.getWindowModuleSource(sessionId, 'window-system-terminal');
    expect(moduleSnapshot.revision).toBe(1);
    expect(moduleSnapshot.source).toContain('host.terminal.sendInput');
  });

  it('keeps system app updates as no-op', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    orchestrator.openWindow({
      sessionId,
      windowId: 'window-system-preference',
      appId: 'preference',
      title: 'Preference'
    });

    const snapshot = orchestrator.requestUpdate({
      sessionId,
      windowId: 'window-system-preference',
      instruction: 'Should be ignored'
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.revision).toBe(1);
  });

  it('still opens llm apps in loading state', () => {
    const orchestrator = createOrchestrator();
    const sessionId = orchestrator.createSession();
    const snapshot = orchestrator.openWindow({
      sessionId,
      windowId: 'window-llm-notes',
      appId: 'notes',
      title: 'Notes'
    });

    expect(snapshot.status).toBe('loading');
    expect(snapshot.revision).toBe(0);
  });
});
