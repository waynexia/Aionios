import { MEDIA_SOURCE_DATA_URL } from '../fixtures.mjs';
import { openDesktopApp } from '../actions.mjs';

export default {
  id: 'media',
  title: 'Media app loads data URL',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const openedMedia = await openDesktopApp(ctx, 'media');
    const windowId = openedMedia.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-media-app]') instanceof HTMLElement &&
                frame.querySelector('[data-media-source]') instanceof HTMLInputElement &&
                frame.querySelector('[data-media-load]') instanceof HTMLButtonElement &&
                frame.querySelector('[data-media-player]') instanceof HTMLElement;
            })()`
          )
        ),
      'Media app root/hooks did not render'
    );

    const mediaLoaded = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const sourceInput = frame.querySelector('[data-media-source]');
        const loadButton = frame.querySelector('[data-media-load]');
        if (!(sourceInput instanceof HTMLInputElement)) return false;
        if (!(loadButton instanceof HTMLButtonElement)) return false;
        const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!inputValueSetter) return false;
        inputValueSetter.call(sourceInput, ${JSON.stringify(MEDIA_SOURCE_DATA_URL)});
        sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
        loadButton.click();
        return true;
      })()`
    );
    if (!mediaLoaded) {
      throw new Error('Unable to load source in Media app');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const player = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"] [data-media-player]');
              if (!(player instanceof HTMLElement)) return false;
              const image = player.querySelector('img');
              return image instanceof HTMLImageElement && image.src.startsWith('data:image/gif');
            })()`
          )
        ),
      'Media player did not update after loading source'
    );
  }
};
