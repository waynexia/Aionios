import { DIRECTORY_DRAFT_PATH } from '../fixtures.mjs';
import { doubleClick, openDesktopApp } from '../actions.mjs';

export default {
  id: 'open-file',
  title: 'Directory double-click opens file in Editor',
  dependsOn: ['directory'],
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
              const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(DIRECTORY_DRAFT_PATH)} + '"]');
              return entry instanceof HTMLButtonElement;
            })()`
          )
        ),
      'Directory did not list the draft entry for file-open check'
    );

    const existingEditorWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll('.window-frame[data-app-id="editor"][data-window-id]')).map((frame) => frame.getAttribute('data-window-id')).filter(Boolean)`
    );

    const entryCenter = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="directory"][data-window-id="${directoryWindowId}"]');
        if (!(frame instanceof HTMLElement)) return null;
        const entry = frame.querySelector('button[data-directory-entry-path="' + ${JSON.stringify(DIRECTORY_DRAFT_PATH)} + '"]');
        if (!(entry instanceof HTMLElement)) return null;
        entry.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = entry.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      })()`
    );
    if (!entryCenter) {
      throw new Error('Unable to resolve Directory entry center for file-open check');
    }

    await doubleClick(ctx, entryCenter);

    let editorWindowId = null;
    await ctx.waitFor(
      async () => {
        editorWindowId = await ctx.evaluate(
          `(() => {
            const existing = new Set(${JSON.stringify(existingEditorWindowIds ?? [])});
            const frames = Array.from(document.querySelectorAll('.window-frame[data-app-id="editor"][data-window-id]'));
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
        return Boolean(editorWindowId);
      },
      'Editor window did not open after Directory double-click'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${editorWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-editor-app]') instanceof HTMLElement &&
                frame.querySelector('[data-editor-textarea]') instanceof HTMLTextAreaElement &&
                frame.querySelector('[data-editor-selected]') instanceof HTMLElement;
            })()`
          )
        ),
      'Editor did not render after file-open'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${editorWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const selected = frame.querySelector('[data-editor-selected]');
              return selected instanceof HTMLElement && (selected.textContent ?? '').trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)};
            })()`
          )
        ),
      'Editor did not select the opened file'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${editorWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const textarea = frame.querySelector('[data-editor-textarea]');
              return textarea instanceof HTMLTextAreaElement && textarea.value.includes('Directory CDP check');
            })()`
          )
        ),
      'Editor did not load opened file content automatically'
    );
  }
};

