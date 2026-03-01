import { getTaskbarStatus, openDesktopApp } from '../actions.mjs';

export default {
  id: 'terminal',
  title: 'Terminal app executes host command',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const opened = await openDesktopApp(ctx, 'terminal');
    const windowId = opened.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="terminal"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const registry = globalThis.__AIONIOS_XTERM__;
              return Boolean(registry && registry[${JSON.stringify(windowId)}]);
            })()`
          )
        ),
      'Terminal xterm instance is not available'
    );

    const started = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="terminal"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const sessionId = frame.dataset.sessionId;
        const windowId = frame.dataset.windowId;
        if (!sessionId || !windowId) return false;
        return fetch(\`/api/sessions/\${sessionId}/windows/\${windowId}/terminal/start\`, { method: 'POST' }).then((response) => response.ok);
      })()`
    );
    if (!started) {
      throw new Error('Could not start host terminal session');
    }

    const submitted = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="terminal"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const sessionId = frame.dataset.sessionId;
        const windowId = frame.dataset.windowId;
        if (!sessionId || !windowId) return false;
        return fetch(\`/api/sessions/\${sessionId}/windows/\${windowId}/terminal/input\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: 'echo __AIONIOS_TERMINAL_OK__\\n' })
        }).then((response) => response.ok);
      })()`
    );
    if (!submitted) {
      throw new Error('Could not send host terminal command');
    }

    await ctx.waitFor(
      async () => {
        const status = await getTaskbarStatus(ctx, windowId);
        if (status !== 'ready') {
          return false;
        }

        const ok = await ctx.evaluate(
          `(() => {
            const registry = globalThis.__AIONIOS_XTERM__;
            const terminal = registry ? registry[${JSON.stringify(windowId)}] : null;
            const active = terminal?.buffer?.active;
            if (!active) {
              return false;
            }
            const start = Math.max(0, active.length - 80);
            let text = '';
            for (let i = start; i < active.length; i += 1) {
              const line = active.getLine(i);
              if (line) {
                text += line.translateToString(true) + '\\n';
              }
            }
            return text.includes('__AIONIOS_TERMINAL_OK__');
          })()`
        );
        return Boolean(ok);
      },
      'Terminal command execution did not produce expected host output'
    );
  }
};
