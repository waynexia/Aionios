import { PREFERENCE_EXPECTED } from '../fixtures.mjs';

export default {
  id: 'final-state',
  title: 'Final desktop state',
  dependsOn: ['terminal', 'preference', 'directory', 'media', 'editor'],
  async run(ctx) {
    const finalState = await ctx.evaluate(
      `(() => {
        const frames = Array.from(document.querySelectorAll('.window-frame'));
        const appIds = frames
          .map((frame) => frame.getAttribute('data-app-id') ?? '')
          .filter(Boolean);
        return {
          windows: frames.length,
          icons: document.querySelectorAll('.desktop-icon').length,
          appIds,
          preferenceStatus:
            document.querySelector('.window-frame[data-app-id="preference"] [data-pref-status]')?.textContent?.trim() ?? ''
        };
      })()`
    );
    const requiredApps = ['terminal', 'preference', 'directory', 'media', 'editor'];
    const missingApps = requiredApps.filter((appId) => !finalState.appIds.includes(appId));
    if (missingApps.length > 0) {
      throw new Error(`Missing expected windows: ${missingApps.join(', ')}`);
    }

    const persistedConfig = await ctx.fetchJson(`${ctx.serverUrl}/api/config`);
    if (
      persistedConfig.llmBackend !== PREFERENCE_EXPECTED.llmBackend ||
      persistedConfig.codexCommand !== PREFERENCE_EXPECTED.codexCommand ||
      persistedConfig.codexTimeoutMs !== PREFERENCE_EXPECTED.codexTimeoutMs ||
      persistedConfig.terminalShell !== PREFERENCE_EXPECTED.terminalShell
    ) {
      throw new Error(`Preference API values mismatch: ${JSON.stringify(persistedConfig)}`);
    }

    if (
      typeof finalState.preferenceStatus === 'string' &&
      !finalState.preferenceStatus.includes('Preferences saved.')
    ) {
      console.warn(
        '[verify:cdp] warning: preference status did not confirm save:',
        JSON.stringify(finalState.preferenceStatus)
      );
    }

    if (finalState.windows < requiredApps.length || finalState.icons < 2) {
      throw new Error(`Unexpected final desktop state: ${JSON.stringify(finalState)}`);
    }

    console.log('[verify:cdp] success:', finalState);
    return finalState;
  }
};
