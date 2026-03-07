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

    async function installCreateNewRequestDelay() {
      const installed = await ctx.evaluate(
        `(() => {
          if (typeof window.__aioniosRestoreCreateNewDelay === 'function') {
            return true;
          }
          const originalFetch = window.fetch.bind(window);
          const delayMs = 1600;
          window.__aioniosRestoreCreateNewDelay = () => {
            window.fetch = originalFetch;
            delete window.__aioniosRestoreCreateNewDelay;
          };
          window.fetch = (...args) => {
            const request = args[0];
            const requestUrl =
              typeof request === 'string'
                ? request
                : request && typeof request === 'object' && 'url' in request
                  ? String(request.url)
                  : String(request ?? '');
            const pathname = new URL(requestUrl, window.location.href).pathname;
            const shouldDelay =
              pathname === '/api/llm/artifact-metadata' || pathname === '/api/apps';
            if (!shouldDelay) {
              return originalFetch(...args);
            }
            return new Promise((resolve, reject) => {
              window.setTimeout(() => {
                originalFetch(...args).then(resolve, reject);
              }, delayMs);
            });
          };
          return true;
        })()`
      );
      if (!installed) {
        throw new Error('Unable to install delayed Create New fetch hooks');
      }
    }

    async function restoreCreateNewRequestDelay() {
      await ctx.evaluate(
        `(() => {
          const restore = window.__aioniosRestoreCreateNewDelay;
          if (typeof restore === 'function') {
            restore();
            return true;
          }
          return false;
        })()`
      );
    }

    const existingWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll('.window-frame[data-window-id]'))
        .map((frame) => frame.getAttribute('data-window-id'))
        .filter(Boolean)`
    );

    try {
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

      await installCreateNewRequestDelay();

      const instruction = 'Persisted app test prompt';
      const promptFilled = await ctx.evaluate(
        `(() => {
          const textarea = document.querySelector('[data-prompt-dialog-textarea]');
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
          const button = document.querySelector('[data-prompt-dialog-confirm]');
          if (!(button instanceof HTMLButtonElement)) return false;
          if (button.disabled) return false;
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

      await ctx.waitFor(
        async () => Boolean(await ctx.evaluate("document.querySelector('[data-prompt-dialog]') === null")),
        'Prompt dialog did not close after persisted app creation'
      );

      let windowId = null;
      await ctx.waitFor(
        async () => {
          windowId = await ctx.evaluate(
            `(() => {
              const existing = new Set(${JSON.stringify(existingWindowIds)});
              const frames = Array.from(document.querySelectorAll('.window-frame[data-window-id]'));
              for (const frame of frames) {
                if (!(frame instanceof HTMLElement)) continue;
                const candidateWindowId = frame.dataset.windowId;
                if (!candidateWindowId) continue;
                if (existing.has(candidateWindowId)) continue;
                return candidateWindowId;
              }
              return null;
            })()`
          );
          return Boolean(windowId);
        },
        'Persisted app placeholder window did not open immediately after Create New',
        1200
      );

      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(
              `(() => {
                const frame = document.querySelector(${JSON.stringify(
                  `.window-frame[data-window-id="${windowId}"]`
                )});
                if (!(frame instanceof HTMLElement)) return false;
                return frame.querySelector('[data-llm-generation]') instanceof HTMLElement;
              })()`
            )
          ),
        'Persisted app placeholder did not render loading UI',
        1200
      );

      await ctx.waitFor(
        async () => (await getTaskbarStatus(ctx, windowId)) === 'loading',
        'Persisted app placeholder did not enter loading state immediately',
        1200
      );

      let appId = null;
      await ctx.waitFor(
        async () => {
          appId = await ctx.evaluate(
            `document.querySelector(${JSON.stringify(
              `.window-frame[data-window-id="${windowId}"]`
            )})?.getAttribute('data-app-id') ?? null`
          );
          return typeof appId === 'string' && appId.startsWith('app-');
        },
        'Persisted app window did not receive a managed app id after Create New'
      );

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

      await ctx.waitFor(
        async () =>
          Boolean(
            await ctx.evaluate(
              `document.querySelector(${JSON.stringify(
                `.window-frame[data-window-id="${reopenedWindowId}"]`
              )}) === null`
            )
          ),
        'Reopened persisted app window did not close'
      );
    } finally {
      await restoreCreateNewRequestDelay();
    }
  }
};
