const SHELL_READY_EXPR =
  "document.querySelectorAll('.desktop-icon[data-app-id]').length >= 1 && document.querySelector('.taskbar') !== null && document.querySelector('.desktop-shell') !== null";

export default {
  id: 'desktop-shell',
  title: 'Desktop shell renders',
  async run(ctx) {
    await ctx.waitFor(async () => Boolean(await ctx.evaluate(SHELL_READY_EXPR)), 'Desktop shell did not render');

    const iconCount = await ctx.evaluate("document.querySelectorAll('.desktop-icon').length");
    if (iconCount < 1) {
      throw new Error('No desktop apps found to open');
    }

    let shikiOk = null;
    try {
      shikiOk = await ctx.evaluate("import('shiki/bundle/web').then(() => true).catch(() => false)");
    } catch {
      // Vite may reload after first dependency optimization; re-check shell below.
    }
    if (shikiOk === false) {
      console.warn('[verify:cdp] warning: unable to warm up shiki dependency');
    }

    let xtermOk = null;
    try {
      xtermOk = await ctx.evaluate(
        "Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/addon-web-links')]).then(() => true).catch(() => false)"
      );
    } catch {
      // Vite may reload after first dependency optimization; re-check shell below.
    }
    if (xtermOk === false) {
      console.warn('[verify:cdp] warning: unable to warm up xterm dependencies');
    }

    let windowModuleOk = null;
    try {
      windowModuleOk = await ctx.evaluate(
        "import('/@window-app/cdp/warm/entry.tsx').then(() => true).catch(() => false)"
      );
    } catch {
      // Vite may reload after the first virtual window module request; re-check shell below.
    }
    if (windowModuleOk === false) {
      console.warn('[verify:cdp] warning: unable to warm up virtual window module');
    }

    let windowModuleQueryOk = null;
    try {
      windowModuleQueryOk = await ctx.evaluate(
        "import('/@window-app/cdp/warm/entry.tsx?rev=1&nonce=0').then(() => true).catch(() => false)"
      );
    } catch {
      // Vite may reload after the first virtual window module with query parameters; re-check shell below.
    }
    if (windowModuleQueryOk === false) {
      console.warn('[verify:cdp] warning: unable to warm up virtual window module (query)');
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate(SHELL_READY_EXPR)),
      'Desktop shell did not stabilize after dependency warm-up'
    );

    const STABILITY_WINDOW_MS = 1200;
    const MAX_STABILITY_ATTEMPTS = 5;

    for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt += 1) {
      await ctx.waitFor(
        async () => Boolean(await ctx.evaluate(SHELL_READY_EXPR)),
        'Desktop shell did not stabilize after dependency warm-up'
      );

      const stability = await ctx.evaluate(`(() => {
        window.__aioniosCdpStabilityMarker = (window.__aioniosCdpStabilityMarker ?? 0) + 1;
        return {
          marker: window.__aioniosCdpStabilityMarker,
          timeOrigin: performance.timeOrigin
        };
      })()`);

      await ctx.delay(STABILITY_WINDOW_MS);

      const next = await ctx.evaluate(`(() => {
        return {
          ready: ${SHELL_READY_EXPR},
          marker: window.__aioniosCdpStabilityMarker ?? null,
          timeOrigin: performance.timeOrigin
        };
      })()`);

      if (
        next.ready === true &&
        next.marker === stability.marker &&
        next.timeOrigin === stability.timeOrigin
      ) {
        return;
      }

      console.warn(
        `[verify:cdp] warning: desktop shell reload detected during warm-up (attempt ${String(attempt)}/${String(MAX_STABILITY_ATTEMPTS)})`
      );
    }

    throw new Error('Desktop shell became unstable after dependency warm-up');
  }
};
