import { MEDIA_SOURCE_DATA_URL, MEDIA_VIDEO_SOURCE_DATA_URL } from '../fixtures.mjs';
import { openDesktopApp } from '../actions.mjs';

export default {
  id: 'media',
  title: 'Media app loads data URL + sets wallpaper',
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
                frame.querySelector('[data-media-set-wallpaper]') instanceof HTMLButtonElement &&
                frame.querySelector('[data-media-clear-wallpaper]') instanceof HTMLButtonElement &&
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

    const wallpaperSet = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const setButton = frame.querySelector('[data-media-set-wallpaper]');
        if (!(setButton instanceof HTMLButtonElement)) return false;
        setButton.click();
        return true;
      })()`
    );
    if (!wallpaperSet) {
      throw new Error('Unable to click Set as Wallpaper');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const wallpaper = document.querySelector('[data-desktop-wallpaper-image]');
              if (!(wallpaper instanceof HTMLImageElement)) return false;
              return wallpaper.src.startsWith('data:image/gif');
            })()`
          )
        ),
      'Wallpaper image did not render after setting wallpaper'
    );

    const videoLoaded = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const sourceInput = frame.querySelector('[data-media-source]');
        const loadButton = frame.querySelector('[data-media-load]');
        if (!(sourceInput instanceof HTMLInputElement)) return false;
        if (!(loadButton instanceof HTMLButtonElement)) return false;
        const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!inputValueSetter) return false;
        inputValueSetter.call(sourceInput, ${JSON.stringify(MEDIA_VIDEO_SOURCE_DATA_URL)});
        sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
        loadButton.click();
        return true;
      })()`
    );
    if (!videoLoaded) {
      throw new Error('Unable to load video source in Media app');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const player = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"] [data-media-player]');
              if (!(player instanceof HTMLElement)) return false;
              const video = player.querySelector('video');
              return video instanceof HTMLVideoElement && video.src.startsWith('data:video/mp4');
            })()`
          )
        ),
      'Media player did not update after loading video source'
    );

    const videoWallpaperSet = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const setButton = frame.querySelector('[data-media-set-wallpaper]');
        if (!(setButton instanceof HTMLButtonElement)) return false;
        setButton.click();
        return true;
      })()`
    );
    if (!videoWallpaperSet) {
      throw new Error('Unable to click Set as Wallpaper for video');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const wallpaper = document.querySelector('[data-desktop-wallpaper-video]');
              if (!(wallpaper instanceof HTMLVideoElement)) return false;
              return wallpaper.src.startsWith('data:video/mp4');
            })()`
          )
        ),
      'Wallpaper video did not render after setting video wallpaper'
    );

    const wallpaperCleared = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const clearButton = frame.querySelector('[data-media-clear-wallpaper]');
        if (!(clearButton instanceof HTMLButtonElement)) return false;
        clearButton.click();
        return true;
      })()`
    );
    if (!wallpaperCleared) {
      throw new Error('Unable to click Clear Wallpaper');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => !document.querySelector('[data-desktop-wallpaper]'))()`
          )
        ),
      'Wallpaper did not clear after requesting clear'
    );
  }
};
