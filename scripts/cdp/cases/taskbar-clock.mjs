export default {
  id: 'taskbar-clock',
  title: 'Taskbar clock ticks',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const clock = document.querySelector('[data-taskbar-clock]');
              if (!(clock instanceof HTMLElement)) return false;
              const time = clock.querySelector('[data-taskbar-time]')?.textContent?.trim() ?? '';
              const date = clock.querySelector('[data-taskbar-date]')?.textContent?.trim() ?? '';
              return /^\\d{2}:\\d{2}:\\d{2}$/.test(time) && /^\\d{4}\\/\\d{2}\\/\\d{2}$/.test(date);
            })()`
          )
        ),
      'Taskbar clock did not render'
    );

    const initialClockTime = await ctx.evaluate(
      "document.querySelector('[data-taskbar-time]')?.textContent?.trim() ?? ''"
    );
    await ctx.waitFor(
      async () => {
        const nextClockTime = await ctx.evaluate(
          "document.querySelector('[data-taskbar-time]')?.textContent?.trim() ?? ''"
        );
        return Boolean(nextClockTime) && nextClockTime !== initialClockTime;
      },
      'Taskbar clock did not tick',
      5000
    );
  }
};

