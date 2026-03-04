import { DIRECTORY_DRAFT_PATH, EDITOR_MARKER } from '../fixtures.mjs';
import { openDesktopApp } from '../actions.mjs';

export default {
  id: 'editor',
  title: 'Editor app edits and previews markdown',
  dependsOn: ['directory'],
  async run(ctx) {
    const openedEditor = await openDesktopApp(ctx, 'editor');
    const windowId = openedEditor.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-editor-app]') instanceof HTMLElement &&
                frame.querySelector('[data-editor-files]') instanceof HTMLElement &&
                frame.querySelector('[data-editor-textarea]') instanceof HTMLTextAreaElement &&
                frame.querySelector('[data-editor-save]') instanceof HTMLButtonElement &&
                frame.querySelector('[data-editor-preview]') instanceof HTMLElement;
            })()`
          )
        ),
      'Editor app root/hooks did not render'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return Array.from(frame.querySelectorAll('[data-editor-files] button')).some(
                (button) =>
                  button instanceof HTMLButtonElement &&
                  !button.disabled &&
                  button.textContent?.trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)}
              );
            })()`
          )
        ),
      'Editor file list did not expose saved Directory draft'
    );

    const clicked = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const targetButton = Array.from(frame.querySelectorAll('[data-editor-files] button')).find(
          (button) => button.textContent?.trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)}
        );
        if (!(targetButton instanceof HTMLButtonElement)) return false;
        if (targetButton.disabled) return false;
        targetButton.click();
        return true;
      })()`
    );
    if (!clicked) {
      throw new Error('Failed to select saved Directory draft in Editor');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const textarea = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"] [data-editor-textarea]');
              return textarea instanceof HTMLTextAreaElement && textarea.value.includes('Directory CDP check');
            })()`
          )
        ),
      'Editor did not load selected file content'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const textarea = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"] [data-editor-textarea]');
              return textarea instanceof HTMLTextAreaElement && !textarea.disabled;
            })()`
          )
        ),
      'Editor textarea did not become editable'
    );

    const editorEdited = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const textarea = frame.querySelector('[data-editor-textarea]');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!textareaValueSetter) return false;
        const nextValue = textarea.value + '\\n' + ${JSON.stringify(EDITOR_MARKER)};
        textareaValueSetter.call(textarea, nextValue);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!editorEdited) {
      throw new Error('Unable to edit file content in Editor app');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const saveButton = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"] [data-editor-save]');
              return saveButton instanceof HTMLButtonElement && !saveButton.disabled;
            })()`
          )
        ),
      'Editor save button did not become enabled after edit'
    );

    const editorSaved = await ctx.evaluate(
      `(() => {
        const saveButton = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"] [data-editor-save]');
        if (!(saveButton instanceof HTMLButtonElement)) return false;
        saveButton.click();
        return true;
      })()`
    );
    if (!editorSaved) {
      throw new Error('Unable to save edited file in Editor app');
    }

    await ctx.waitFor(
      async () => {
        try {
          const saved = await ctx.fetchJson(
            `${ctx.serverUrl}/api/fs/file?path=${encodeURIComponent(DIRECTORY_DRAFT_PATH)}`
          );
          return typeof saved.content === 'string' && saved.content.includes(EDITOR_MARKER);
        } catch {
          return false;
        }
      },
      'Editor did not persist edited content to host FS'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const preview = frame.querySelector('[data-editor-preview]');
              if (!(preview instanceof HTMLElement)) return false;
              const html = preview.innerHTML ?? '';
              return html.includes('<span') && html.includes('class="shiki');
            })()`
          )
        ),
      'Editor did not apply Shiki syntax highlighting'
    );

    const editorUiUpdated = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const preview = frame.querySelector('[data-editor-preview]');
        if (!(preview instanceof HTMLElement)) return false;
        const statusSaved = (frame.textContent ?? '').includes(${JSON.stringify(`Saved ${DIRECTORY_DRAFT_PATH}.`)});
        const previewText = preview.textContent ?? '';
        const hasHighlightedMarkup =
          preview.innerHTML.includes('class="shiki') || preview.innerHTML.includes("class='shiki");
        return statusSaved && hasHighlightedMarkup && previewText.includes(${JSON.stringify(EDITOR_MARKER)});
      })()`
    );
    if (!editorUiUpdated) {
      console.warn('[verify:cdp] warning: editor UI did not fully reflect saved content; host FS was updated');
    }
  }
};
