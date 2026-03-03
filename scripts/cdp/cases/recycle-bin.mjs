import { RECYCLE_BIN_DRAFT_CONTENT, RECYCLE_BIN_DRAFT_PATH } from '../fixtures.mjs';
import { openDesktopApp } from '../actions.mjs';

export default {
  id: 'recycle-bin',
  title: 'Recycle Bin restores deleted files',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const openedDirectory = await openDesktopApp(ctx, 'directory');
    const directoryWindowId = openedDirectory.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-directory-app]') instanceof HTMLElement &&
                frame.querySelector('[data-directory-list]') instanceof HTMLElement &&
                frame.querySelector('[data-directory-save]') instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Directory app did not render (recycle bin precondition)'
    );

    const draftCreated = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
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
        inputValueSetter.call(pathInput, ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)});
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
        textareaValueSetter.call(contentInput, ${JSON.stringify(RECYCLE_BIN_DRAFT_CONTENT)});
        contentInput.dispatchEvent(new Event('input', { bubbles: true }));
        saveButton.click();
        return true;
      })()`
    );
    if (!draftCreated) {
      throw new Error('Unable to create draft file for recycle bin case');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const selectedPath = frame.querySelector('[data-directory-selected]')?.textContent?.trim() ?? '';
              const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
              return selectedPath === ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} && entry instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Directory did not reflect saved draft before recycle bin delete'
    );

    const contextMenuDispatched = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
        if (!(entry instanceof HTMLElement)) return false;
        entry.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = entry.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
          buttons: 2
        });
        entry.dispatchEvent(event);
        return true;
      })()`
    );
    if (!contextMenuDispatched) {
      throw new Error('Unable to open file context menu for recycle bin delete');
    }

    await ctx.waitFor(
      async () =>
        Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'File context menu did not open'
    );

    const deleteSelected = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-context-menu-item="delete"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!deleteSelected) {
      throw new Error('Unable to select Delete from file context menu');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
              return entry === null;
            })()`
          )
        ),
      'Deleted file still appears in Directory app list'
    );

    const openedRecycleBin = await openDesktopApp(ctx, 'recycle-bin');
    const recycleWindowId = openedRecycleBin.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="recycle-bin"][data-window-id="${recycleWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-recycle-bin-app]') instanceof HTMLElement &&
                frame.querySelector('[data-recycle-bin-list]') instanceof HTMLElement &&
                frame.querySelector('[data-recycle-bin-empty]') instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Recycle Bin app root/hooks did not render'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="recycle-bin"][data-window-id="${recycleWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const entry = frame.querySelector('[data-recycle-bin-original-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
              return entry instanceof HTMLElement;
            })()`
          )
        ),
      'Recycle bin did not list the deleted file'
    );

    const recycleBinContextMenuDispatched = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="recycle-bin"][data-window-id="${recycleWindowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const entry = frame.querySelector('[data-recycle-bin-original-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
        if (!(entry instanceof HTMLElement)) return false;
        entry.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = entry.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
          buttons: 2
        });
        entry.dispatchEvent(event);
        return true;
      })()`
    );
    if (!recycleBinContextMenuDispatched) {
      throw new Error('Unable to open context menu for recycle bin item');
    }

    await ctx.waitFor(
      async () =>
        Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'Recycle bin context menu did not open'
    );

    const restoreSelected = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-context-menu-item="restore"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!restoreSelected) {
      throw new Error('Unable to select Restore from recycle bin context menu');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(RECYCLE_BIN_DRAFT_PATH)} + '"]');
              return entry instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Restored file did not reappear in Directory app list'
    );
  }
};
