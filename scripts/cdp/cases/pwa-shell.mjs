export default {
  id: 'pwa-shell',
  title: 'PWA manifest and service worker are active',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const manifestInfo = await ctx.evaluate(`(() => {
      const link = document.querySelector('link[rel="manifest"]');
      const themeColor = document.querySelector('meta[name="theme-color"]');
      const appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
      return {
        href: link?.getAttribute('href') ?? '',
        themeColor: themeColor?.getAttribute('content') ?? '',
        appleCapable: appleCapable?.getAttribute('content') ?? ''
      };
    })()`);

    if (manifestInfo.href !== '/site.webmanifest') {
      throw new Error(`Unexpected manifest href: ${JSON.stringify(manifestInfo.href)}`);
    }
    if (manifestInfo.themeColor !== '#08070d') {
      throw new Error(`Unexpected theme color: ${JSON.stringify(manifestInfo.themeColor)}`);
    }
    if (manifestInfo.appleCapable !== 'yes') {
      throw new Error('Missing Apple mobile web app capability meta tag');
    }

    const manifest = await ctx.fetchJson(`${ctx.serverUrl}/site.webmanifest`);
    if (
      manifest.display !== 'standalone' ||
      manifest.start_url !== '/' ||
      manifest.scope !== '/' ||
      manifest.id !== '/' ||
      manifest.background_color !== '#08070d' ||
      manifest.theme_color !== '#08070d'
    ) {
      throw new Error(`Unexpected manifest payload: ${JSON.stringify(manifest)}`);
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(`(() => {
            return navigator.serviceWorker?.getRegistration?.()
              .then((registration) => Boolean(registration?.active))
              .catch(() => false);
          })()`)
        ),
      'Service worker did not become active'
    );

    const readyState = await ctx.evaluate(`(() => {
      return navigator.serviceWorker.ready.then((registration) => ({
        scope: registration.scope,
        scriptURL: registration.active?.scriptURL ?? '',
        state: registration.active?.state ?? ''
      }));
    })()`);

    if (!String(readyState.scriptURL).endsWith('/service-worker.js')) {
      throw new Error(`Unexpected service worker script: ${JSON.stringify(readyState)}`);
    }

    await ctx.Page.navigate({ url: `${ctx.serverUrl}/?pwa-control=1` });
    await ctx.Page.loadEventFired();

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(`(() => {
            return Boolean(navigator.serviceWorker?.controller);
          })()`)
        ),
      'Service worker did not take control after reload'
    );

    const cacheState = await ctx.evaluate(`(() => {
      return caches.keys().then((keys) => ({
        keys,
        hasShellCache: keys.some((key) => key.includes('aionios-shell-v1'))
      }));
    })()`);

    if (!cacheState.hasShellCache) {
      throw new Error(`Expected shell cache was not created: ${JSON.stringify(cacheState)}`);
    }

    console.log('[verify:cdp] pwa ready:', {
      manifest,
      readyState,
      cacheState
    });
  }
};
