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
        saveButton.click();
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
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const selectedPath = frame.querySelector('[data-directory-selected]')?.textContent?.trim() ?? '';
              const listButtons = Array.from(frame.querySelectorAll('[data-directory-list] button'));
              const hasSavedEntry = listButtons.some(
                (button) => button.textContent?.trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)}
              );
              const draftContent = frame.querySelector('[data-directory-content]')?.value ?? '';
              return selectedPath === ${JSON.stringify(DIRECTORY_DRAFT_PATH)} &&
                hasSavedEntry &&
                draftContent === ${JSON.stringify(DIRECTORY_DRAFT_CONTENT)};
            })()`
          )
        ),
      'Directory save did not update UI state as expected'
    );
  }
};
