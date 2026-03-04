import { pressKey } from '../actions.mjs';

export default {
  id: 'create-new-file',
  title: 'Create New can create an SVG file',
  dependsOn: ['context-menu'],
  async run(ctx) {
    const initialFiles = await ctx.fetchJson(`${ctx.serverUrl}/api/fs/files`);
    const initialSvgCount = Array.isArray(initialFiles.files)
      ? initialFiles.files.filter((file) => String(file.path ?? '').toLowerCase().endsWith('.svg')).length
      : 0;

    const existingMediaWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll('.window-frame[data-app-id="media"][data-window-id]'))
        .map((frame) => frame.getAttribute('data-window-id'))
        .filter(Boolean)`
    );

    const contextMenuAnchor = await ctx.evaluate(
      `(() => {
        const workspace = document.querySelector('.desktop-shell__workspace');
        if (!(workspace instanceof HTMLElement)) {
          return null;
        }
        const rect = workspace.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width - 36),
          y: Math.round(rect.top + rect.height - 36)
        };
      })()`
    );
    if (!contextMenuAnchor) {
      throw new Error('Desktop workspace metrics unavailable for Create New file check');
    }

    await ctx.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: contextMenuAnchor.x,
      y: contextMenuAnchor.y,
      button: 'none'
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: contextMenuAnchor.x,
      y: contextMenuAnchor.y,
      button: 'right',
      clickCount: 1
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: contextMenuAnchor.x,
      y: contextMenuAnchor.y,
      button: 'right',
      clickCount: 1
    });

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")
        ),
      'Desktop context menu did not open for Create New file check'
    );

    const createSelected = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-context-menu-item="create"]');
        if (!(button instanceof HTMLButtonElement)) {
          return false;
        }
        button.click();
        return true;
      })()`
    );
    if (!createSelected) {
      throw new Error('Unable to select Create New for file creation');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-prompt-dialog]') instanceof HTMLElement")
        ),
      'Prompt dialog did not open for Create New file check'
    );

    const instruction = 'Create an SVG image: a simple white rocket on a dark blue background.';
    const promptFilled = await ctx.evaluate(
      `(() => {
        const textarea = document.querySelector('.prompt-dialog__textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(textarea, ${JSON.stringify(instruction)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!promptFilled) {
      throw new Error('Unable to fill Create New prompt for file creation');
    }

    const submitted = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('.prompt-dialog__button--primary');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!submitted) {
      throw new Error('Unable to submit Create New prompt for file creation');
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-prompt-dialog]') === null")),
      'Prompt dialog did not close after Create New file submission'
    );

    await pressKey(ctx, 'Escape');
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') === null")),
      'Context menu did not close after Create New file submission'
    );

    await ctx.waitFor(
      async () => {
        const listed = await ctx.fetchJson(`${ctx.serverUrl}/api/fs/files`);
        if (!Array.isArray(listed.files)) {
          return false;
        }
        const svgCount = listed.files.filter((file) =>
          String(file.path ?? '').toLowerCase().endsWith('.svg')
        ).length;
        return svgCount === initialSvgCount + 1;
      },
      'SVG file was not created by Create New'
    );

    let mediaWindowId = null;
    await ctx.waitFor(
      async () => {
        mediaWindowId = await ctx.evaluate(
          `(() => {
            const existing = new Set(${JSON.stringify(existingMediaWindowIds ?? [])});
            const frames = Array.from(document.querySelectorAll('.window-frame[data-app-id="media"][data-window-id]'));
            for (const frame of frames) {
              if (!(frame instanceof HTMLElement)) continue;
              const windowId = frame.getAttribute('data-window-id');
              if (!windowId) continue;
              if (existing.has(windowId)) continue;
              return windowId;
            }
            return null;
          })()`
        );
        return Boolean(mediaWindowId);
      },
      'Media window did not open for created SVG file'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="media"][data-window-id="${mediaWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const player = frame.querySelector('[data-media-player]');
              if (!(player instanceof HTMLElement)) return false;
              const image = player.querySelector('img');
              return image instanceof HTMLImageElement && (image.src || '').startsWith('data:image/svg+xml');
            })()`
          )
        ),
      'Created SVG did not render in Media window'
    );

    const closed = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${mediaWindowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const closeButton = frame.querySelector('button[aria-label="Close window"]');
        if (!(closeButton instanceof HTMLButtonElement)) return false;
        closeButton.click();
        return true;
      })()`
    );
    if (!closed) {
      throw new Error('Unable to close Media window created by Create New file');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `document.querySelector(${JSON.stringify(
              `.window-frame[data-window-id="${mediaWindowId}"]`
            )}) === null`
          )
        ),
      'Media window did not close after Create New file check'
    );
  }
};
