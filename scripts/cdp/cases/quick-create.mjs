import { click, getElementCenter, getTaskbarStatus } from '../actions.mjs';

export default {
  id: 'quick-create',
  title: 'Taskbar quick create creates a desktop file',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const initialFiles = await ctx.fetchJson(`${ctx.serverUrl}/api/fs/files`);
    const initialTxtPaths = new Set(
      Array.isArray(initialFiles.files)
        ? initialFiles.files
            .map((entry) => String(entry.path ?? ''))
            .filter((path) => path.toLowerCase().endsWith('.txt'))
        : []
    );

    const existingEditorWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll('.window-frame[data-app-id="editor"][data-window-id]'))
        .map((frame) => frame.getAttribute('data-window-id'))
        .filter(Boolean)`
    );

    const startCenter = await getElementCenter(ctx, '[data-taskbar-start]', 'taskbar start button');
    await click(ctx, startCenter);

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-quick-create]') instanceof HTMLElement")
        ),
      'Quick create popover did not open'
    );

    const instruction = 'Create a plain text file: Quick create CDP check.';
    const filled = await ctx.evaluate(
      `(() => {
        const textarea = document.querySelector('[data-quick-create-textarea]');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(textarea, ${JSON.stringify(instruction)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!filled) {
      throw new Error('Unable to fill quick create prompt');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const button = document.querySelector('[data-quick-create-submit]');
              return button instanceof HTMLButtonElement && !button.disabled;
            })()`
          )
        ),
      'Quick create submit button did not become enabled'
    );

    const submitted = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('[data-quick-create-submit]');
        if (!(button instanceof HTMLButtonElement)) return false;
        if (button.disabled) return false;
        button.click();
        return true;
      })()`
    );
    if (!submitted) {
      throw new Error('Unable to submit quick create prompt');
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-quick-create]') === null")),
      'Quick create popover did not close after submit'
    );

    let createdPath = null;
    await ctx.waitFor(
      async () => {
        const listed = await ctx.fetchJson(`${ctx.serverUrl}/api/fs/files`);
        if (!Array.isArray(listed.files)) {
          return false;
        }
        const txtPaths = listed.files
          .map((entry) => String(entry.path ?? ''))
          .filter((path) => path.toLowerCase().endsWith('.txt'));
        createdPath = txtPaths.find((path) => !initialTxtPaths.has(path)) ?? null;
        return Boolean(createdPath);
      },
      'Quick create did not create a .txt file on the host FS'
    );

    if (typeof createdPath !== 'string' || createdPath.trim().length === 0) {
      throw new Error(`Quick create did not return a valid created path: ${JSON.stringify(createdPath)}`);
    }
    if (createdPath.includes('/')) {
      throw new Error(`Expected quick create file to be on desktop root, got: ${createdPath}`);
    }

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
      'Editor window did not open for quick created file'
    );

    await ctx.waitFor(async () => {
      const status = await getTaskbarStatus(ctx, editorWindowId);
      return status === 'ready' || status === 'error';
    }, 'Editor window did not resolve to ready/error after quick create');

    const finalStatus = await getTaskbarStatus(ctx, editorWindowId);
    if (finalStatus === 'error') {
      const runtimeMessage = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${editorWindowId}"] .window-runtime__status`
        )})?.textContent?.trim() ?? ''`
      );
      throw new Error(`Editor window opened in error after quick create: ${runtimeMessage || 'unknown error'}`);
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${editorWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              return frame.querySelector('[data-editor-app]') instanceof HTMLElement;
            })()`
          )
        ),
      'Editor app did not render after quick create'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="editor"][data-window-id="${editorWindowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const selected = frame.querySelector('[data-editor-selected]');
              return selected instanceof HTMLElement && (selected.textContent ?? '').trim() === ${JSON.stringify(
                createdPath
              )};
            })()`
          )
        ),
      'Editor did not select the quick created file'
    );

    const closed = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${editorWindowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const closeButton = frame.querySelector('button[aria-label="Close window"]');
        if (!(closeButton instanceof HTMLButtonElement)) return false;
        closeButton.click();
        return true;
      })()`
    );
    if (!closed) {
      throw new Error('Unable to close Editor window created by quick create');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `document.querySelector(${JSON.stringify(
              `.window-frame[data-window-id="${editorWindowId}"]`
            )}) === null`
          )
        ),
      'Editor window did not close after quick create'
    );
  }
};
