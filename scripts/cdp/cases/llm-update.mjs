import { getTaskbarStatus } from '../actions.mjs';

function getRevisionExpression(windowId) {
  return `(() => {
    const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
    if (!(frame instanceof HTMLElement)) return null;
    const text = frame.querySelector('.window-frame__title small')?.textContent ?? '';
    const match = text.match(/rev\\s+(\\d+)/i);
    if (!match) return null;
    return Number.parseInt(match[1], 10);
  })()`;
}

export default {
  id: 'llm-update',
  title: 'LLM window updates and loads new revision',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const appId = 'notes';
    const iconSelector = `.desktop-icon[data-app-id="${appId}"]`;
    const existingWindowIds = await ctx.evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(
        `.window-frame[data-app-id="${appId}"]`
      )})).map((frame) => frame.getAttribute('data-window-id')).filter(Boolean)`
    );

    const contextMenuDispatched = await ctx.evaluate(
      `(() => {
        const icon = document.querySelector(${JSON.stringify(iconSelector)});
        if (!(icon instanceof HTMLElement)) {
          return false;
        }
        icon.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = icon.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y
        });
        icon.dispatchEvent(event);
        return true;
      })()`
    );
    if (!contextMenuDispatched) {
      throw new Error(`Unable to dispatch context menu event for appId=${appId}`);
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'Icon context menu did not open'
    );

    const contextMenuSelected = await ctx.evaluate(
      `(() => {
        const item = document.querySelector('[data-context-menu-item="open-with-prompt"]');
        if (!(item instanceof HTMLButtonElement)) return false;
        item.click();
        return true;
      })()`
    );
    if (!contextMenuSelected) {
      throw new Error('Unable to select "Open with prompt…" from icon context menu');
    }

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-prompt-dialog]') instanceof HTMLElement")),
      'Prompt dialog did not open after selecting open-with-prompt'
    );

    const openPrompt = 'Build a note-taking window with a markdown preview and a tag picker.';
    const promptFilled = await ctx.evaluate(
      `(() => {
        const textarea = document.querySelector('.prompt-dialog__textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(textarea, ${JSON.stringify(openPrompt)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!promptFilled) {
      throw new Error('Unable to fill prompt dialog textarea');
    }

    const promptSubmitted = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('.prompt-dialog__button--primary');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!promptSubmitted) {
      throw new Error('Unable to submit prompt dialog');
    }

    let windowId = null;
    const resolveOpenedWindowId = async () =>
      ctx.evaluate(
        `(() => {
          const existing = new Set(${JSON.stringify(existingWindowIds)});
          const frames = Array.from(document.querySelectorAll(${JSON.stringify(
            `.window-frame[data-app-id="${appId}"]`
          )}));
          for (const frame of frames) {
            if (!(frame instanceof HTMLElement)) continue;
            const id = frame.dataset.windowId;
            if (!id) continue;
            if (existing.has(id)) continue;
            return id;
          }
          const taskbarButtons = Array.from(document.querySelectorAll(${JSON.stringify(
            `.taskbar__window[data-app-id="${appId}"]`
          )}));
          for (const button of taskbarButtons) {
            if (!(button instanceof HTMLElement)) continue;
            const id = button.dataset.windowId;
            if (!id) continue;
            if (existing.has(id)) continue;
            return id;
          }
          return null;
        })()`
      );

    await ctx.waitFor(
      async () => {
        windowId = await resolveOpenedWindowId();
        return Boolean(windowId);
      },
      `Window frame did not appear for appId=${appId}`,
      8000
    );

    await ctx.waitFor(async () => {
      const status = await getTaskbarStatus(ctx, windowId);
      return status === 'ready' || status === 'error';
    }, 'LLM window did not resolve to ready/error');

    const finalStatus = await getTaskbarStatus(ctx, windowId);
    if (finalStatus === 'error') {
      const runtimeMessage = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${windowId}"] .window-runtime__status`
        )})?.textContent?.trim() ?? ''`
      );
      throw new Error(
        `Window opened in error state for appId=${appId}: ${runtimeMessage || 'unknown error'}`
      );
    }

    const hasHostUpdateControl = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        return Boolean(frame.querySelector('.window-frame__actions button[aria-label="Ask LLM to update window"]'));
      })()`
    );
    if (!hasHostUpdateControl) {
      throw new Error('Expected host LLM update control to be present in window header');
    }

    const initialRevision = await ctx.evaluate(getRevisionExpression(windowId));
    if (typeof initialRevision !== 'number' || initialRevision < 1) {
      throw new Error(`Unable to resolve initial LLM revision: ${String(initialRevision)}`);
    }

    const initialSummary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
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
    if (!initialSummary.includes('Last instruction:') || !initialSummary.includes('tag picker')) {
      throw new Error(
        `Expected initial open-with-prompt summary to reflect prompt, got: ${JSON.stringify(initialSummary)}`
      );
    }

    const clicked = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const buttons = Array.from(frame.querySelectorAll('button'));
        const target = buttons.find((button) => (button.textContent ?? '').includes('Ask LLM to Evolve'));
        if (!(target instanceof HTMLButtonElement)) return false;
        target.click();
        return true;
      })()`
    );
    if (!clicked) {
      throw new Error('Unable to click "Ask LLM to Evolve" button inside LLM window');
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }
        const revision = await ctx.evaluate(getRevisionExpression(windowId));
        return typeof revision === 'number' && revision > initialRevision;
      },
      'LLM window did not update to a newer revision'
    );

    const summary = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-window-id="${windowId}"]');
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
    if (!summary.includes('Last instruction:')) {
      throw new Error(`Expected updated mock summary to include last instruction, got: ${JSON.stringify(summary)}`);
    }
  }
};
