import fsPromises from 'node:fs/promises';
import { openDesktopApp } from '../actions.mjs';
import { PREFERENCE_EXPECTED } from '../fixtures.mjs';

export default {
  id: 'preference',
  title: 'Preference app saves config',
  dependsOn: ['desktop-shell'],
  async run(ctx) {
    const openedPreference = await openDesktopApp(ctx, 'preference');
    const windowId = openedPreference.windowId;

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"] [data-pref-form]') instanceof HTMLElement`
          )
        ),
      'Preference form did not render'
    );

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const backend = frame.querySelector('[data-pref-field="llm-backend"]');
              const command = frame.querySelector('[data-pref-field="codex-command"]');
              const timeout = frame.querySelector('[data-pref-field="codex-timeout-ms"]');
              const shell = frame.querySelector('[data-pref-field="terminal-shell"]');
              const submit = frame.querySelector('[data-pref-action="save"]');
              if (!(backend instanceof HTMLSelectElement)) return false;
              if (!(command instanceof HTMLInputElement)) return false;
              if (!(timeout instanceof HTMLInputElement)) return false;
              if (!(shell instanceof HTMLInputElement)) return false;
              if (!(submit instanceof HTMLButtonElement)) return false;
              return !backend.disabled && !command.disabled && !timeout.disabled && !shell.disabled && !submit.disabled;
            })()`
          )
        ),
      'Preference form did not become interactive'
    );

    const preferenceEdited = await ctx.evaluate(
      `(() => {
        const frame = document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"]');
        if (!(frame instanceof HTMLElement)) return false;
        const backend = frame.querySelector('[data-pref-field="llm-backend"]');
        const command = frame.querySelector('[data-pref-field="codex-command"]');
        const timeout = frame.querySelector('[data-pref-field="codex-timeout-ms"]');
        const shell = frame.querySelector('[data-pref-field="terminal-shell"]');
        const submit = frame.querySelector('[data-pref-action="save"]');
        if (!(backend instanceof HTMLSelectElement)) return false;
        if (!(command instanceof HTMLInputElement)) return false;
        if (!(timeout instanceof HTMLInputElement)) return false;
        if (!(shell instanceof HTMLInputElement)) return false;
        if (!(submit instanceof HTMLButtonElement)) return false;
        const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const selectValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        if (!inputValueSetter || !selectValueSetter) return false;
        selectValueSetter.call(backend, ${JSON.stringify(PREFERENCE_EXPECTED.llmBackend)});
        backend.dispatchEvent(new Event('change', { bubbles: true }));
        inputValueSetter.call(command, ${JSON.stringify(PREFERENCE_EXPECTED.codexCommand)});
        command.dispatchEvent(new Event('input', { bubbles: true }));
        inputValueSetter.call(timeout, ${JSON.stringify(String(PREFERENCE_EXPECTED.codexTimeoutMs))});
        timeout.dispatchEvent(new Event('input', { bubbles: true }));
        inputValueSetter.call(shell, ${JSON.stringify(PREFERENCE_EXPECTED.terminalShell)});
        shell.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`
    );
    if (!preferenceEdited) {
      throw new Error('Unable to edit Preference fields through Preference app');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => {
              const frame = document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"]');
              if (!(frame instanceof HTMLElement)) return false;
              const backend = frame.querySelector('[data-pref-field="llm-backend"]');
              const command = frame.querySelector('[data-pref-field="codex-command"]');
              const timeout = frame.querySelector('[data-pref-field="codex-timeout-ms"]');
              const shell = frame.querySelector('[data-pref-field="terminal-shell"]');
              if (!(backend instanceof HTMLSelectElement)) return false;
              if (!(command instanceof HTMLInputElement)) return false;
              if (!(timeout instanceof HTMLInputElement)) return false;
              if (!(shell instanceof HTMLInputElement)) return false;
              return backend.value === ${JSON.stringify(PREFERENCE_EXPECTED.llmBackend)} &&
                command.value === ${JSON.stringify(PREFERENCE_EXPECTED.codexCommand)} &&
                timeout.value === ${JSON.stringify(String(PREFERENCE_EXPECTED.codexTimeoutMs))} &&
                shell.value === ${JSON.stringify(PREFERENCE_EXPECTED.terminalShell)};
            })()`
          )
        ),
      'Preference form fields were not updated'
    );

    const preferenceSubmitted = await ctx.evaluate(
      `(() => {
        const button = document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"] [data-pref-action="save"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()`
    );
    if (!preferenceSubmitted) {
      throw new Error('Unable to submit Preference form');
    }

    await ctx.waitFor(
      async () =>
        Boolean(
          await ctx.evaluate(
            `(() => (document.querySelector('.window-frame[data-app-id="preference"][data-window-id="${windowId}"] [data-pref-status]')?.textContent ?? '').includes('Preferences saved.'))()`
          )
        ),
      'Preference save did not complete'
    );

    const persistedConfig = await ctx.fetchJson(`${ctx.serverUrl}/api/config`);
    if (
      persistedConfig.llmBackend !== PREFERENCE_EXPECTED.llmBackend ||
      persistedConfig.codexCommand !== PREFERENCE_EXPECTED.codexCommand ||
      persistedConfig.codexTimeoutMs !== PREFERENCE_EXPECTED.codexTimeoutMs ||
      persistedConfig.terminalShell !== PREFERENCE_EXPECTED.terminalShell
    ) {
      throw new Error(`Preference API values mismatch: ${JSON.stringify(persistedConfig)}`);
    }

    const persistedToml = await fsPromises.readFile(ctx.configPath, 'utf8');
    const hasTimeout = /codex_timeout_ms\s*=\s*(54_321|54321)/.test(persistedToml);
    if (
      !persistedToml.includes('backend = "codex"') ||
      !hasTimeout ||
      !persistedToml.includes('shell = "/bin/sh"')
    ) {
      throw new Error('Preference config file does not contain expected persisted values');
    }
  }
};
