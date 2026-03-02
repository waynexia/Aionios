import { getTaskbarStatus, openDesktopApp } from '../actions.mjs';

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
    const opened = await openDesktopApp(ctx, 'notes');
    const windowId = opened.windowId;

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

