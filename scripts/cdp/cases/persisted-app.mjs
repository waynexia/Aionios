import { getTaskbarStatus, openDesktopApp, pressKey } from '../actions.mjs';

export default {
  id: 'persisted-app',
  title: 'Create New persists app and reloads code',
  dependsOn: ['context-menu'],
  async run(ctx) {
    async function readLastInstructionSummary(windowId) {
      return ctx.evaluate(
        `(() => {
          const frame = document.querySelector(${JSON.stringify(
            `.window-frame[data-window-id="${windowId}"]`
          )});
          if (!(frame instanceof HTMLElement)) return '';
          const paragraphs = Array.from(frame.querySelectorAll('p'));
          for (const paragraph of paragraphs) {
            const text = paragraph.textContent?.trim() ?? '';
            if (text.includes('Last instruction:')) {
              return text;
            }
          }
          return '';
        })()`
      );
    }

    const existingManagedWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll('.window-frame[data-app-id^="app-"]'))
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
          x: Math.round(rect.left + rect.width - 40),
          y: Math.round(rect.top + rect.height - 40)
        };
      })()`
    );
    if (!contextMenuAnchor) {
      throw new Error('Desktop workspace metrics unavailable for persisted app creation');
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
      'Desktop context menu did not open for persisted app creation'
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
      throw new Error('Unable to select Create New for persisted app creation');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-prompt-dialog]') instanceof HTMLElement")
        ),
      'Prompt dialog did not open for persisted app creation'
    );

    const instruction = 'Persisted app test prompt';
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
      throw new Error('Unable to fill Create New prompt for persisted app creation');
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
      throw new Error('Unable to submit Create New prompt');
    }

    await pressKey(ctx, 'Escape');
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') === null")),
      'Context menu did not close after persisted app creation'
    );

    let created = null;
    const resolveCreatedWindow = async () =>
      ctx.evaluate(
        `(() => {
          const existing = new Set(${JSON.stringify(existingManagedWindowIds)});
          const frames = Array.from(document.querySelectorAll('.window-frame[data-app-id^="app-"]'));
          for (const frame of frames) {
            if (!(frame instanceof HTMLElement)) continue;
            const windowId = frame.dataset.windowId;
            const appId = frame.dataset.appId;
            if (!windowId || !appId) continue;
            if (existing.has(windowId)) continue;
            return { windowId, appId };
          }
          return null;
        })()`
      );

    await ctx.waitFor(
      async () => {
        created = await resolveCreatedWindow();
        return Boolean(created && created.windowId && created.appId);
      },
      'Persisted app window did not appear after Create New'
    );

    const windowId = created.windowId;
    const appId = created.appId;
    if (typeof appId !== 'string' || !appId.startsWith('app-')) {
      throw new Error(`Expected persisted appId to start with app-, got: ${JSON.stringify(appId)}`);
    }

    await ctx.waitFor(async () => {
      const status = await getTaskbarStatus(ctx, windowId);
      return status === 'ready' || status === 'error';
    }, 'Persisted app window did not resolve to ready/error');

    const finalStatus = await getTaskbarStatus(ctx, windowId);
    if (finalStatus === 'error') {
      const runtimeMessage = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${windowId}"] .window-runtime__status`
        )})?.textContent?.trim() ?? ''`
      );
      throw new Error(`Persisted app window opened in error: ${runtimeMessage || 'unknown error'}`);
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `document.querySelector(${JSON.stringify(
              `.desktop-icon[data-app-id="${appId}"]`
            )}) instanceof HTMLElement`
          )
        ),
      'Persisted app icon did not appear on desktop'
    );

    await ctx.waitFor(
      async () => {
        const summary = await readLastInstructionSummary(windowId);
        return summary.includes('Last instruction:') && summary.includes(instruction);
      },
      'Initial persisted app did not reflect prompt'
    );
    const initialSummary = await readLastInstructionSummary(windowId);
    if (!initialSummary.includes('Last instruction:') || !initialSummary.includes(instruction)) {
      throw new Error(
        `Initial persisted app did not reflect prompt, got: ${JSON.stringify(initialSummary)}`
      );
    }

    const closed = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${windowId}"]`
        )});
        if (!(frame instanceof HTMLElement)) return false;
        const closeButton = frame.querySelector('button[aria-label="Close window"]');
        if (!(closeButton instanceof HTMLButtonElement)) return false;
        closeButton.click();
        return true;
      })()`
    );
    if (!closed) {
      throw new Error('Unable to close persisted app window');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `document.querySelector(${JSON.stringify(
              `.window-frame[data-window-id="${windowId}"]`
            )}) === null`
          )
        ),
      'Persisted app window did not close'
    );

    const reopened = await openDesktopApp(ctx, appId);
    const reopenedWindowId = reopened.windowId;

    await ctx.waitFor(async () => {
      const status = await getTaskbarStatus(ctx, reopenedWindowId);
      return status === 'ready' || status === 'error';
    }, 'Reopened persisted app window did not resolve to ready/error');

    const reopenedStatus = await getTaskbarStatus(ctx, reopenedWindowId);
    if (reopenedStatus === 'error') {
      const runtimeMessage = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${reopenedWindowId}"] .window-runtime__status`
        )})?.textContent?.trim() ?? ''`
      );
      throw new Error(
        `Reopened persisted app window opened in error: ${runtimeMessage || 'unknown error'}`
      );
    }

    await ctx.waitFor(
      async () => {
        const summary = await readLastInstructionSummary(reopenedWindowId);
        return summary.includes('Last instruction:') && summary.includes(instruction);
      },
      'Reopened persisted app did not reuse stored code'
    );
    const reopenedSummary = await readLastInstructionSummary(reopenedWindowId);
    if (!reopenedSummary.includes('Last instruction:') || !reopenedSummary.includes(instruction)) {
      throw new Error(
        `Reopened persisted app did not reuse stored code, got: ${JSON.stringify(reopenedSummary)}`
      );
    }

    const reopenedClosed = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${reopenedWindowId}"]`
        )});
        if (!(frame instanceof HTMLElement)) return false;
        const closeButton = frame.querySelector('button[aria-label="Close window"]');
        if (!(closeButton instanceof HTMLButtonElement)) return false;
        closeButton.click();
        return true;
      })()`
    );
    if (!reopenedClosed) {
      throw new Error('Unable to close reopened persisted app window');
    }
  }
};
