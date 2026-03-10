import {
  getElementCenter,
  touchLongPress,
  touchSwipe,
  touchTap
} from '../actions.mjs';

const MOBILE_METRICS = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
  positionX: 0,
  positionY: 0,
  screenOrientation: {
    angle: 0,
    type: 'portraitPrimary'
  }
};

async function enableMobileMode(ctx) {
  await ctx.Emulation.setDeviceMetricsOverride(MOBILE_METRICS);
  await ctx.Emulation.setTouchEmulationEnabled({
    enabled: true,
    configuration: 'mobile'
  });
  await ctx.Page.navigate({ url: ctx.serverUrl });
  await ctx.Page.loadEventFired();
}

async function restoreDesktopMode(ctx) {
  await ctx.Emulation.clearDeviceMetricsOverride();
  await ctx.Emulation.setTouchEmulationEnabled({
    enabled: false
  });
  await ctx.Page.navigate({ url: ctx.serverUrl });
  await ctx.Page.loadEventFired();
}

export default {
  id: 'mobile-shell',
  title: 'Mobile adaptive shell behaves like a phone',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    await enableMobileMode(ctx);

    try {
      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(
              `document.querySelector('.desktop-shell[data-mobile-mode="true"]') instanceof HTMLElement`
            )
          ),
        'Mobile shell did not enter mobile mode'
      );

      const chromeReady = await ctx.evaluate(`(() => {
        const shell = document.querySelector('.desktop-shell[data-mobile-mode="true"]');
        const nav = document.querySelector('[data-mobile-system-nav]');
        const status = document.querySelector('[data-mobile-status-bar]');
        const taskbar = document.querySelector('.taskbar');
        return Boolean(shell && nav && status) && !taskbar;
      })()`);
      if (!chromeReady) {
        throw new Error('Mobile chrome did not render correctly');
      }

      const initialSurface = await ctx.evaluate(
        `document.querySelector('.desktop-shell')?.getAttribute('data-mobile-surface') ?? ''`
      );
      if (initialSurface !== 'home') {
        await touchTap(
          ctx,
          await getElementCenter(ctx, '[data-mobile-nav-button="home"]', 'home button')
        );
        await ctx.waitFor(
          async () =>
            (await ctx.evaluate(
              `document.querySelector('.desktop-shell')?.getAttribute('data-mobile-surface') ?? ''`
            )) === 'home',
          'Home button did not return the shell to the mobile home surface'
        );
      }

      const directoryIcon = await getElementCenter(
        ctx,
        '.desktop-icon[data-app-id="directory"]',
        'directory icon'
      );
      await touchLongPress(ctx, directoryIcon);

      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(`(() => {
              const menu = document.querySelector('[data-context-menu]');
              if (!(menu instanceof HTMLElement)) return false;
              return Array.from(menu.querySelectorAll('[data-context-menu-item]')).some(
                (item) => item.textContent?.trim() === 'Open Directory'
              );
            })()`)
          ),
        'Long press did not open the mobile context menu'
      );

      await touchTap(ctx, {
        x: Math.round(MOBILE_METRICS.width / 2),
        y: Math.round(MOBILE_METRICS.height / 2)
      });
      await ctx.delay(320);

      await touchTap(ctx, directoryIcon);
      let directoryWindowId = null;
      await ctx.waitFor(
        async () => {
          directoryWindowId = await ctx.evaluate(
            `document.querySelector('.window-frame[data-app-id="directory"][data-window-id]')?.getAttribute('data-window-id') ?? null`
          );
          const surface = await ctx.evaluate(
            `document.querySelector('.desktop-shell')?.getAttribute('data-mobile-surface') ?? ''`
          );
          return Boolean(directoryWindowId) && surface === 'app';
        },
        'Tap did not open Directory in mobile app mode'
      );

      await touchSwipe(
        ctx,
        [
          { x: 195, y: 820 },
          { x: 195, y: 720 },
          { x: 195, y: 620 }
        ],
        24
      );

      await ctx.waitFor(
        async () =>
          (await ctx.evaluate(`document.querySelector('.desktop-shell')?.getAttribute('data-mobile-surface') ?? ''`)) ===
          'home',
        'Bottom swipe did not return to the mobile home surface'
      );

      const preferenceIcon = await getElementCenter(
        ctx,
        '.desktop-icon[data-app-id="preference"]',
        'preference icon'
      );
      await touchTap(ctx, preferenceIcon);

      let preferenceWindowId = null;
      await ctx.waitFor(
        async () => {
          preferenceWindowId = await ctx.evaluate(
            `document.querySelector('.window-frame[data-app-id="preference"][data-window-id]')?.getAttribute('data-window-id') ?? null`
          );
          return Boolean(preferenceWindowId);
        },
        'Preference did not open in mobile mode'
      );

      const recentsButton = await getElementCenter(
        ctx,
        '[data-mobile-nav-button="recents"]',
        'recent tasks button'
      );
      await touchTap(ctx, recentsButton);

      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(`(() => {
              const shell = document.querySelector('.desktop-shell[data-mobile-surface="recents"]');
              const cards = document.querySelectorAll('[data-mobile-task-card]');
              return shell instanceof HTMLElement && cards.length >= 2;
            })()`)
          ),
        'Recent tasks did not render in mobile mode'
      );

      const preferenceCardCenter = await getElementCenter(
        ctx,
        `[data-mobile-task-card="${preferenceWindowId}"]`,
        'preference task card'
      );
      await touchSwipe(
        ctx,
        [
          preferenceCardCenter,
          { x: preferenceCardCenter.x - 90, y: preferenceCardCenter.y },
          { x: preferenceCardCenter.x - 180, y: preferenceCardCenter.y }
        ],
        18
      );

      await ctx.waitFor(
        async () =>
          !(await ctx.evaluate(
            `document.querySelector(${JSON.stringify(`[data-mobile-task-card="${preferenceWindowId}"]`)}) instanceof HTMLElement`
          )),
        'Swipe-to-dismiss did not close the recent task card'
      );

      await touchTap(
        ctx,
        await getElementCenter(
          ctx,
          `[data-mobile-task-card="${directoryWindowId}"]`,
          'directory task card'
        )
      );

      await ctx.waitFor(
        async () => {
          const surface = await ctx.evaluate(
            `document.querySelector('.desktop-shell')?.getAttribute('data-mobile-surface') ?? ''`
          );
          const visibleWindowId = await ctx.evaluate(
            `document.querySelector('.window-frame[data-window-id]')?.getAttribute('data-window-id') ?? ''`
          );
          return surface === 'app' && visibleWindowId === directoryWindowId;
        },
        'Selecting a recent task did not restore the app'
      );

      await touchSwipe(
        ctx,
        [
          { x: 8, y: 360 },
          { x: 86, y: 360 },
          { x: 158, y: 360 }
        ],
        24
      );

      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(`(() => {
              const shell = document.querySelector('.desktop-shell');
              const surface = shell?.getAttribute('data-mobile-surface') ?? '';
              if (surface === 'home') {
                return true;
              }
              if (surface !== 'app') {
                return false;
              }
              const visibleWindowId =
                document.querySelector('.window-frame[data-window-id]')?.getAttribute('data-window-id') ?? '';
              return Boolean(visibleWindowId) && visibleWindowId !== ${JSON.stringify(directoryWindowId)};
            })()`)
          ),
        'Edge-swipe back did not navigate away from the current mobile app'
      );
    } finally {
      await restoreDesktopMode(ctx);
      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(
              `document.querySelector('.desktop-shell[data-mobile-mode="false"]') instanceof HTMLElement`
            )
          ),
        'Desktop shell did not recover after mobile verification'
      );
    }
  }
};
