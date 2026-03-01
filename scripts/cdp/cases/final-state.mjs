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

    if (typeof finalState.preferenceStatus === 'string' && !finalState.preferenceStatus.includes('Preferences saved.')) {
      throw new Error(`Preference status did not confirm save: ${JSON.stringify(finalState.preferenceStatus)}`);
    }

    if (finalState.windows < requiredApps.length || finalState.icons < 2) {
      throw new Error(`Unexpected final desktop state: ${JSON.stringify(finalState)}`);
    }

    console.log('[verify:cdp] success:', finalState);
    return finalState;
  }
};
