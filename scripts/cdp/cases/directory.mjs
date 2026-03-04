import { DIRECTORY_DRAFT_CONTENT, DIRECTORY_DRAFT_PATH } from '../fixtures.mjs';
import { openDesktopApp } from '../actions.mjs';

export default {
  id: 'directory',
  title: 'Directory app saves draft',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const openedDirectory = await openDesktopApp(ctx, 'directory');
    const windowId = openedDirectory.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-directory-app]') instanceof HTMLElement &&
                frame.querySelector('[data-directory-list]') instanceof HTMLElement &&
                frame.querySelector('[data-directory-selected]') instanceof HTMLElement &&
                frame.querySelector('[data-directory-save]') instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Directory app root/hooks did not render'
    );

    const directoryEdited = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const pathInput = frame.querySelector('[data-directory-path]');
        const contentInput = frame.querySelector('[data-directory-content]');
        const saveButton = frame.querySelector('[data-directory-save]');
        if (!(pathInput instanceof HTMLInputElement)) return false;
        if (!(contentInput instanceof HTMLTextAreaElement)) return false;
        if (!(saveButton instanceof HTMLButtonElement)) return false;
        const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!inputValueSetter || !textareaValueSetter) return false;
        inputValueSetter.call(pathInput, ${JSON.stringify(DIRECTORY_DRAFT_PATH)});
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
        textareaValueSetter.call(contentInput, ${JSON.stringify(DIRECTORY_DRAFT_CONTENT)});
        contentInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!directoryEdited) {
      throw new Error('Unable to create/save a draft in Directory app');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const button = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"] [data-directory-save]');
              return button instanceof HTMLButtonElement && !button.disabled;
            })()`
          )
        ),
      'Directory save button did not become enabled'
    );

    const directorySaved = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"] [data-directory-save]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!directorySaved) {
      throw new Error('Unable to submit Directory save');
    }

    await ctx.waitFor(
      async () => {
        try {
          const saved = await ctx.fetchJson(
            `${ctx.serverUrl}/api/fs/file?path=${encodeURIComponent(DIRECTORY_DRAFT_PATH)}`
          );
          return saved.content === DIRECTORY_DRAFT_CONTENT;
        } catch {
          return false;
        }
      },
      'Directory draft did not persist to host FS'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(DIRECTORY_DRAFT_PATH)} + '"]');
              return entry instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Directory did not list saved draft entry'
    );
  }
};
