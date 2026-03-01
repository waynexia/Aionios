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
      shikiOk = await ctx.evaluate("import('shiki').then(() => true).catch(() => false)");
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

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate(SHELL_READY_EXPR)),
      'Desktop shell did not stabilize after dependency warm-up'
    );

    await ctx.delay(400);
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate(SHELL_READY_EXPR)),
      'Desktop shell became unstable after dependency warm-up'
    );
  }
};
