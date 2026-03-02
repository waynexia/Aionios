const EXPECTED_HREFS = [
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/favicon-white-32x32.png',
  '/favicon-white-16x16.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-white.png',
  '/site.webmanifest'
];

export default {
  id: 'branding-icons',
  title: 'Branding icons wired',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const headLinks = await ctx.evaluate(
      `(() => {
        return Array.from(document.querySelectorAll('head link'))
          .map((link) => ({
            rel: link.getAttribute('rel') ?? '',
            href: link.getAttribute('href') ?? '',
            sizes: link.getAttribute('sizes') ?? '',
            type: link.getAttribute('type') ?? ''
          }))
          .filter((link) => link.href.length > 0);
      })()`
    );

    const missing = EXPECTED_HREFS.filter(
      (href) => !headLinks.some((link) => link.href === href)
    );
    if (missing.length > 0) {
      throw new Error(`Missing head icon links: ${missing.join(', ')}`);
    }

    const assetStatuses = await ctx.evaluate(
      `Promise.all(${JSON.stringify(EXPECTED_HREFS)}.map(async (href) => {
        const response = await fetch(href);
        return { href, status: response.status, ok: response.ok };
      }))`
    );

    const unreachable = assetStatuses.filter((entry) => !entry.ok);
    if (unreachable.length > 0) {
      throw new Error(`Branding assets not reachable: ${JSON.stringify(unreachable)}`);
    }

    const taskbarIconHref = await ctx.evaluate(
      `document.querySelector('.taskbar__start-icon')?.getAttribute('src') ?? ''`
    );
    if (taskbarIconHref !== '/icons/icon-white-48x48.png') {
      throw new Error(`Taskbar icon did not use the white variant: ${JSON.stringify(taskbarIconHref)}`);
    }

    console.log('[verify:cdp] branding icons ok:', assetStatuses);
  }
};
