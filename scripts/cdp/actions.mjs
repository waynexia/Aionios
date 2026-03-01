export async function getElementCenter(ctx, selector, description = selector) {
  const anchor = await ctx.evaluate(
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
    })()`
  );
  if (!anchor) {
    throw new Error(`Unable to resolve element center for ${description}`);
  }
  return anchor;
}

export async function click(ctx, anchor, button = 'left') {
  await ctx.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: anchor.x,
    y: anchor.y,
    button: 'none'
  });
  await ctx.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: anchor.x,
    y: anchor.y,
    button,
    clickCount: 1
  });
  await ctx.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: anchor.x,
    y: anchor.y,
    button,
    clickCount: 1
  });
}

export async function doubleClick(ctx, anchor, button = 'left') {
  await ctx.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: anchor.x,
    y: anchor.y,
    button: 'none'
  });

  for (let clickCount = 1; clickCount <= 2; clickCount += 1) {
    await ctx.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x: anchor.x,
      y: anchor.y,
      button,
      clickCount
    });
    await ctx.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x: anchor.x,
      y: anchor.y,
      button,
      clickCount
    });
    await ctx.delay(35);
  }
}

async function dispatchDoubleClick(ctx, selector, anchor) {
  return ctx.evaluate(
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.scrollIntoView({ block: 'center', inline: 'center' });
      const event = new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: ${Math.round(anchor.x)},
        clientY: ${Math.round(anchor.y)},
        detail: 2
      });
      element.dispatchEvent(event);
      return true;
    })()`
  );
}

async function isPointWithinElement(ctx, selector, anchor) {
  return ctx.evaluate(
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const top = document.elementFromPoint(${Math.round(anchor.x)}, ${Math.round(anchor.y)});
      if (!(top instanceof HTMLElement)) {
        return false;
      }
      return top === element || element.contains(top);
    })()`
  );
}

export async function pressKey(ctx, key) {
  const code = key === 'Escape' ? 'Escape' : key;
  const windowsVirtualKeyCode = key === 'Escape' ? 27 : undefined;
  await ctx.Input.dispatchKeyEvent({
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode
  });
  await ctx.Input.dispatchKeyEvent({
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode
  });
}

export async function getTaskbarStatus(ctx, windowId) {
  return ctx.evaluate(
    `document.querySelector(${JSON.stringify(
      `.taskbar__window[data-window-id="${windowId}"] .taskbar__status`
    )})?.textContent?.trim() ?? ''`
  );
}

export async function openDesktopApp(ctx, appId) {
  const iconSelector = `.desktop-icon[data-app-id="${appId}"]`;
  const iconCenter = await getElementCenter(ctx, iconSelector, `desktop icon for appId=${appId}`);

  const existingWindowIds = await ctx.evaluate(
    `Array.from(document.querySelectorAll(${JSON.stringify(
      `.window-frame[data-app-id="${appId}"]`
    )})).map((frame) => frame.getAttribute('data-window-id')).filter(Boolean)`
  );

  const iconClickable = await isPointWithinElement(ctx, iconSelector, iconCenter);

  if (iconClickable) {
    await doubleClick(ctx, iconCenter);
  } else {
    const dispatched = await dispatchDoubleClick(ctx, iconSelector, iconCenter);
    if (!dispatched) {
      throw new Error(`Unable to dispatch open event for appId=${appId}`);
    }
  }

  let openedWindowId = null;
  const resolveOpenedWindowId = async () =>
    ctx.evaluate(
      `(() => {
        const existing = new Set(${JSON.stringify(existingWindowIds)});
        const frames = Array.from(document.querySelectorAll(${JSON.stringify(
          `.window-frame[data-app-id="${appId}"]`
        )}));
        for (const frame of frames) {
          if (!(frame instanceof HTMLElement)) continue;
          const windowId = frame.dataset.windowId;
          if (!windowId) continue;
          if (existing.has(windowId)) continue;
          return windowId;
        }

        const taskbarButtons = Array.from(document.querySelectorAll(${JSON.stringify(
          `.taskbar__window[data-app-id="${appId}"]`
        )}));
        for (const button of taskbarButtons) {
          if (!(button instanceof HTMLElement)) continue;
          const windowId = button.dataset.windowId;
          if (!windowId) continue;
          if (existing.has(windowId)) continue;
          return windowId;
        }

        return null;
      })()`
    );

  try {
    await ctx.waitFor(
      async () => {
        openedWindowId = await resolveOpenedWindowId();
        return Boolean(openedWindowId);
      },
      `Window frame did not appear for appId=${appId}`,
      8000
    );
  } catch (error) {
    if (iconClickable) {
      const dispatched = await dispatchDoubleClick(ctx, iconSelector, iconCenter);
      if (!dispatched) {
        throw error;
      }
      await ctx.waitFor(
        async () => {
          openedWindowId = await resolveOpenedWindowId();
          return Boolean(openedWindowId);
        },
        `Window frame did not appear for appId=${appId}`
      );
    } else {
      throw error;
    }
  }

  const windowId = openedWindowId;

  let sessionId = null;
  await ctx.waitFor(
    async () => {
      sessionId = await ctx.evaluate(
        `document.querySelector(${JSON.stringify(
          `.window-frame[data-window-id="${windowId}"]`
        )})?.getAttribute('data-session-id') ?? null`
      );
      return Boolean(sessionId);
    },
    `Window session did not resolve for appId=${appId}`
  );

  await ctx.waitFor(
    async () =>
      Boolean(
        await ctx.evaluate(
          `document.querySelector(${JSON.stringify(
            `.taskbar__window[data-window-id="${windowId}"]`
          )}) instanceof HTMLElement`
        )
      ),
    `Taskbar entry did not appear for appId=${appId}`
  );

  await ctx.waitFor(async () => {
    const status = await getTaskbarStatus(ctx, windowId);
    return status === 'ready' || status === 'error';
  }, `Window did not resolve to ready/error for appId=${appId}`);

  const finalStatus = await getTaskbarStatus(ctx, windowId);
  if (finalStatus === 'error') {
    const runtimeMessage = await ctx.evaluate(
      `document.querySelector(${JSON.stringify(
        `.window-frame[data-window-id="${windowId}"] .window-runtime__status`
      )})?.textContent?.trim() ?? ''`
    );
    throw new Error(`Window opened in error state for appId=${appId}: ${runtimeMessage || 'unknown error'}`);
  }

  return { windowId, sessionId };
}
