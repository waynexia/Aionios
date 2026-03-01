import { click, getElementCenter, pressKey } from '../actions.mjs';

export default {
  id: 'desktop-icons',
  title: 'Desktop icons select and drag',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const iconAnchor = await getElementCenter(
      ctx,
      '.desktop-icon[data-app-id="terminal"]',
      'Terminal desktop icon'
    );

    await ctx.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: iconAnchor.x,
      y: iconAnchor.y,
      button: 'none'
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: iconAnchor.x,
      y: iconAnchor.y,
      button: 'right',
      clickCount: 1
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: iconAnchor.x,
      y: iconAnchor.y,
      button: 'right',
      clickCount: 1
    });

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const icon = document.querySelector('.desktop-icon[data-app-id="terminal"]');
              return icon instanceof HTMLElement && icon.classList.contains('desktop-icon--selected');
            })()`
          )
        ),
      'Desktop icon did not become selected after right click'
    );

    await pressKey(ctx, 'Escape');
    await ctx.waitFor(
      async () => Boolean(await ctx.evaluate("document.querySelector('[data-context-menu]') === null")),
      'Desktop context menu did not close after icon right-click selection check'
    );

    await click(ctx, iconAnchor);
    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const icon = document.querySelector('.desktop-icon[data-app-id="terminal"]');
              if (!(icon instanceof HTMLElement)) return false;
              const windowCount = document.querySelectorAll('.window-frame').length;
              return icon.classList.contains('desktop-icon--selected') && windowCount === 0;
            })()`
          )
        ),
      'Desktop icon did not show selected state after single click'
    );

    const iconBeforeDrag = await ctx.evaluate(
      `(() => {
        const icon = document.querySelector('.desktop-icon[data-app-id="terminal"]');
        const desktopIcons = document.querySelector('.desktop-icons');
        const workspace = document.querySelector('.desktop-shell__workspace');
        if (
          !(icon instanceof HTMLElement) ||
          !(desktopIcons instanceof HTMLElement) ||
          !(workspace instanceof HTMLElement)
        ) {
          return null;
        }
        const iconRect = icon.getBoundingClientRect();
        const desktopRect = desktopIcons.getBoundingClientRect();
        const workspaceRect = workspace.getBoundingClientRect();
        const relativeLeft = iconRect.left - desktopRect.left;
        const relativeTop = iconRect.top - desktopRect.top;
        const maxShiftRight = Math.max(0, desktopRect.width - relativeLeft - iconRect.width);
        const maxShiftDown = Math.max(0, desktopRect.height - relativeTop - iconRect.height);
        return {
          iconLeft: Math.round(iconRect.left),
          iconTop: Math.round(iconRect.top),
          iconCenterX: Math.round(iconRect.left + iconRect.width / 2),
          iconCenterY: Math.round(iconRect.top + iconRect.height / 2),
          desktopWidth: Math.round(desktopRect.width),
          desktopHeight: Math.round(desktopRect.height),
          workspaceWidth: Math.round(workspaceRect.width),
          workspaceHeight: Math.round(workspaceRect.height),
          maxShiftRight: Math.round(maxShiftRight),
          maxShiftDown: Math.round(maxShiftDown)
        };
      })()`
    );
    if (!iconBeforeDrag) {
      throw new Error('Desktop icon metrics are unavailable before drag check');
    }

    const dragDeltaX = Math.max(
      40,
      Math.min(260, Math.floor(iconBeforeDrag.maxShiftRight * 0.75))
    );
    const dragDeltaY = Math.max(
      40,
      Math.min(260, Math.floor(iconBeforeDrag.maxShiftDown * 0.75))
    );
    const dragEndX = iconBeforeDrag.iconCenterX + dragDeltaX;
    const dragEndY = iconBeforeDrag.iconCenterY + dragDeltaY;

    await ctx.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: iconBeforeDrag.iconCenterX,
      y: iconBeforeDrag.iconCenterY,
      button: 'none'
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: iconBeforeDrag.iconCenterX,
      y: iconBeforeDrag.iconCenterY,
      button: 'left',
      clickCount: 1
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: dragEndX,
      y: dragEndY,
      button: 'left'
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: dragEndX,
      y: dragEndY,
      button: 'left',
      clickCount: 1
    });
    await ctx.delay(120);

    const iconAfterDrag = await ctx.evaluate(
      `(() => {
        const icon = document.querySelector('.desktop-icon[data-app-id="terminal"]');
        if (!(icon instanceof HTMLElement)) {
          return null;
        }
        const iconRect = icon.getBoundingClientRect();
        return {
          iconLeft: Math.round(iconRect.left),
          iconTop: Math.round(iconRect.top)
        };
      })()`
    );
    if (!iconAfterDrag) {
      throw new Error('Desktop icon metrics are unavailable after drag check');
    }

    const horizontalShift = iconAfterDrag.iconLeft - iconBeforeDrag.iconLeft;
    const verticalShift = iconAfterDrag.iconTop - iconBeforeDrag.iconTop;
    const minimumExpectedHorizontalShift = Math.max(24, Math.floor(dragDeltaX * 0.5));
    const minimumExpectedVerticalShift = Math.max(24, Math.floor(dragDeltaY * 0.5));

    if (iconBeforeDrag.desktopWidth < Math.floor(iconBeforeDrag.workspaceWidth * 0.7)) {
      throw new Error(
        `Desktop icon layer is too narrow (${iconBeforeDrag.desktopWidth}px vs workspace ${iconBeforeDrag.workspaceWidth}px)`
      );
    }
    if (iconBeforeDrag.desktopHeight < Math.floor(iconBeforeDrag.workspaceHeight * 0.7)) {
      throw new Error(
        `Desktop icon layer is too short (${iconBeforeDrag.desktopHeight}px vs workspace ${iconBeforeDrag.workspaceHeight}px)`
      );
    }
    if (horizontalShift < minimumExpectedHorizontalShift) {
      throw new Error(
        `Terminal icon horizontal drag shift too small (${horizontalShift}px, expected at least ${minimumExpectedHorizontalShift}px)`
      );
    }
    if (verticalShift < minimumExpectedVerticalShift) {
      throw new Error(
        `Terminal icon vertical drag shift too small (${verticalShift}px, expected at least ${minimumExpectedVerticalShift}px)`
      );
    }

    await ctx.delay(400);
  }
};
