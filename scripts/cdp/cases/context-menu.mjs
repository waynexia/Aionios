import { click, pressKey } from '../actions.mjs';

export default {
  id: 'context-menu',
  title: 'Desktop context menu opens and closes',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const contextMenuAnchor = await ctx.evaluate(
      `(() => {
        const workspace = document.querySelector('.desktop-shell__workspace');
        if (!(workspace instanceof HTMLElement)) {
          return null;
        }
        const rect = workspace.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width - 30),
          y: Math.round(rect.top + rect.height - 30)
        };
      })()`
    );
    if (!contextMenuAnchor) {
      throw new Error('Desktop workspace metrics are unavailable for context menu check');
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
        Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'Desktop context menu did not open'
    );

    const contextMenuLabels = await ctx.evaluate(
      `(() => Array.from(document.querySelectorAll('[data-context-menu-item]')).map((item) => item.textContent?.trim() ?? ''))()`
    );
    const requiredLabels = ['Refresh', 'Create New', 'Delete'];
    if (
      !Array.isArray(contextMenuLabels) ||
      requiredLabels.some((label) => !contextMenuLabels.includes(label))
    ) {
      throw new Error(`Unexpected context menu items: ${JSON.stringify(contextMenuLabels)}`);
    }

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
      throw new Error('Unable to select Create New from desktop context menu');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate("document.querySelector('[data-prompt-dialog]') instanceof HTMLElement")
        ),
      'Prompt dialog did not open after selecting Create New'
    );

    await pressKey(ctx, 'Escape');
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-prompt-dialog]') === null")),
      'Prompt dialog did not close after Escape key'
    );

    await pressKey(ctx, 'Escape');
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') === null")),
      'Desktop context menu did not close after Escape key'
    );

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
        Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') instanceof HTMLElement")),
      'Desktop context menu did not reopen'
    );

    const outsideAnchor = await ctx.evaluate(
      `(() => {
        const workspace = document.querySelector('.desktop-shell__workspace');
        if (!(workspace instanceof HTMLElement)) {
          return null;
        }
        const rect = workspace.getBoundingClientRect();
        return {
          x: Math.round(rect.left + 20),
          y: Math.round(rect.top + 20)
        };
      })()`
    );
    if (!outsideAnchor) {
      throw new Error('Desktop workspace metrics are unavailable for outside click close check');
    }
    await click(ctx, outsideAnchor);

    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') === null")),
      'Desktop context menu did not close after outside click'
    );
  }
};
