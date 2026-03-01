import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import CDP from 'chrome-remote-interface';

const SERVER_URL = 'http://localhost:5173';
const DEBUG_URL = 'http://localhost:9222/json';
const VERIFY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 400;
const PREFERENCE_EXPECTED = {
  llmBackend: 'codex',
  codexCommand: 'codex exec --model gpt-5 --output-last-message',
  codexTimeoutMs: 54321,
  terminalShell: '/bin/sh'
};
const DIRECTORY_DRAFT_PATH = 'notes/cdp-system-app-check.md';
const DIRECTORY_DRAFT_CONTENT = '# Directory CDP check\nCreated by verify:cdp.';
const MEDIA_SOURCE_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
const EDITOR_MARKER = 'CDP_EDITOR_MARKER_20260301';

const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aionios-cdp-'));
const logDir = path.join(tmpDir, 'logs');
const chromeProfileDir = path.join(tmpDir, 'chrome-profile');
const configPath = path.join(tmpDir, 'preferences.toml');
await fsPromises.mkdir(logDir, { recursive: true });
await fsPromises.mkdir(chromeProfileDir, { recursive: true });

function streamProcessOutput(child, logPath, label) {
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  child.stdout.on('data', (chunk) => {
    stream.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stream.write(chunk);
  });
  child.on('close', (code) => {
    stream.write(`\n[${label}] exited with code ${String(code)}\n`);
    stream.end();
  });
}

async function waitFor(check, message, timeoutMs = VERIFY_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check();
      if (result) {
        return;
      }
    } catch {
      // keep polling
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(message);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.json();
}

let devServer;
let chrome;
let cdpClient;

async function evaluate(runtime, expression) {
  const result = await runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime evaluate failed');
  }
  return result.result.value;
}

async function main() {
  console.log('[verify:cdp] temp dir:', tmpDir);
  devServer = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIONIOS_CONFIG_PATH: configPath,
      AIONIOS_LLM_BACKEND: 'mock'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  streamProcessOutput(devServer, path.join(logDir, 'dev-server.log'), 'dev-server');

  await waitFor(async () => {
    try {
      const response = await fetch(SERVER_URL);
      return response.ok;
    } catch {
      return false;
    }
  }, 'Dev server did not become ready');

  chrome = spawn(
    'google-chrome-stable',
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9222',
      `--user-data-dir=${chromeProfileDir}`,
      SERVER_URL
    ],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  streamProcessOutput(chrome, path.join(logDir, 'chrome.log'), 'chrome');

  await waitFor(async () => {
    try {
      const targets = await fetchJson(DEBUG_URL);
      return Array.isArray(targets) && targets.length > 0;
    } catch {
      return false;
    }
  }, 'Chrome remote debugging endpoint is not available');

  const targets = await fetchJson(DEBUG_URL);
  const target = targets.find((item) => String(item.url ?? '').includes('localhost:5173'));
  if (!target) {
    throw new Error('Cannot find target page for localhost:5173 from Chrome remote debugging list');
  }

  cdpClient = await CDP({ target, port: 9222 });
  const { Page, Runtime, Input } = cdpClient;
  await Page.enable();
  await Runtime.enable();

  await Page.navigate({ url: SERVER_URL });
  await Page.loadEventFired();

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "document.querySelectorAll('.desktop-icon').length >= 1 && document.querySelector('.taskbar') !== null && document.querySelector('.desktop-shell') !== null"
        )
      ),
    'Desktop shell did not render'
  );

  const iconCount = await evaluate(Runtime, "document.querySelectorAll('.desktop-icon').length");
  if (iconCount < 1) {
    throw new Error('No desktop apps found to open');
  }

  try {
    await evaluate(Runtime, "import('shiki').then(() => true).catch(() => false)");
  } catch {
    // Vite may reload after first dependency optimization; re-check shell below.
  }

  try {
    await evaluate(
      Runtime,
      "Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit'), import('@xterm/addon-web-links')]).then(() => true).catch(() => false)"
    );
  } catch {
    // Vite may reload after first dependency optimization; re-check shell below.
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "document.querySelectorAll('.desktop-icon').length >= 1 && document.querySelector('.taskbar') !== null && document.querySelector('.desktop-shell') !== null"
        )
    ),
    'Desktop shell did not stabilize after dependency warm-up'
  );

  const terminalIconBeforeDrag = await evaluate(
    Runtime,
    `(() => {
      const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Terminal'));
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
        iconWidth: Math.round(iconRect.width),
        iconHeight: Math.round(iconRect.height),
        desktopWidth: Math.round(desktopRect.width),
        desktopHeight: Math.round(desktopRect.height),
        workspaceWidth: Math.round(workspaceRect.width),
        workspaceHeight: Math.round(workspaceRect.height),
        maxShiftRight: Math.round(maxShiftRight),
        maxShiftDown: Math.round(maxShiftDown)
      };
    })()`
  );
  if (!terminalIconBeforeDrag) {
    throw new Error('Terminal icon metrics are unavailable before drag check');
  }

  const dragDeltaX = Math.max(40, Math.min(260, Math.floor(terminalIconBeforeDrag.maxShiftRight * 0.75)));
  const dragDeltaY = Math.max(40, Math.min(260, Math.floor(terminalIconBeforeDrag.maxShiftDown * 0.75)));
  const dragEndX = terminalIconBeforeDrag.iconCenterX + dragDeltaX;
  const dragEndY = terminalIconBeforeDrag.iconCenterY + dragDeltaY;
  await Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: terminalIconBeforeDrag.iconCenterX,
    y: terminalIconBeforeDrag.iconCenterY,
    button: 'none'
  });
  await Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: terminalIconBeforeDrag.iconCenterX,
    y: terminalIconBeforeDrag.iconCenterY,
    button: 'left',
    clickCount: 1
  });
  await Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x: dragEndX,
    y: dragEndY,
    button: 'left'
  });
  await Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: dragEndX,
    y: dragEndY,
    button: 'left',
    clickCount: 1
  });
  await delay(120);

  const terminalIconAfterDrag = await evaluate(
    Runtime,
    `(() => {
      const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Terminal'));
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
  if (!terminalIconAfterDrag) {
    throw new Error('Terminal icon metrics are unavailable after drag check');
  }

  const horizontalShift = terminalIconAfterDrag.iconLeft - terminalIconBeforeDrag.iconLeft;
  const verticalShift = terminalIconAfterDrag.iconTop - terminalIconBeforeDrag.iconTop;
  const minimumExpectedHorizontalShift = Math.max(24, Math.floor(dragDeltaX * 0.5));
  const minimumExpectedVerticalShift = Math.max(24, Math.floor(dragDeltaY * 0.5));
  if (terminalIconBeforeDrag.desktopWidth < Math.floor(terminalIconBeforeDrag.workspaceWidth * 0.7)) {
    throw new Error(
      `Desktop icon layer is too narrow (${terminalIconBeforeDrag.desktopWidth}px vs workspace ${terminalIconBeforeDrag.workspaceWidth}px)`
    );
  }
  if (terminalIconBeforeDrag.desktopHeight < Math.floor(terminalIconBeforeDrag.workspaceHeight * 0.7)) {
    throw new Error(
      `Desktop icon layer is too short (${terminalIconBeforeDrag.desktopHeight}px vs workspace ${terminalIconBeforeDrag.workspaceHeight}px)`
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
  await delay(300);

  const opened = await evaluate(
    Runtime,
    "(() => { const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Terminal')); if (!icon) return false; icon.click(); return true; })()"
  );
  if (!opened) {
    throw new Error('Failed to click Terminal app icon');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "document.querySelectorAll('.window-frame').length === 1 && document.querySelector('.taskbar__window .taskbar__status')?.textContent?.trim() === 'ready'"
        )
      ),
    'Terminal window did not reach ready state after opening'
  );

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "(() => { const frame = document.querySelector('.window-frame[data-app-id=\"terminal\"]'); if (!(frame instanceof HTMLElement)) return false; const windowId = frame.dataset.windowId; const registry = globalThis.__AIONIOS_XTERM__; return Boolean(windowId && registry && registry[windowId]); })()"
        )
      ),
    'Terminal xterm instance is not available'
  );

  const started = await evaluate(
    Runtime,
    "(() => { const frame = document.querySelector('.window-frame[data-app-id=\"terminal\"]'); if (!(frame instanceof HTMLElement)) return false; const sessionId = frame.dataset.sessionId; const windowId = frame.dataset.windowId; if (!sessionId || !windowId) return false; return fetch(`/api/sessions/${sessionId}/windows/${windowId}/terminal/start`, { method: 'POST' }).then((response) => response.ok); })()"
  );
  if (!started) {
    throw new Error('Could not start host terminal session');
  }

  const submitted = await evaluate(
    Runtime,
    "(() => { const frame = document.querySelector('.window-frame[data-app-id=\"terminal\"]'); if (!(frame instanceof HTMLElement)) return false; const sessionId = frame.dataset.sessionId; const windowId = frame.dataset.windowId; if (!sessionId || !windowId) return false; return fetch(`/api/sessions/${sessionId}/windows/${windowId}/terminal/input`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'echo __AIONIOS_TERMINAL_OK__\\n' }) }).then((response) => response.ok); })()"
  );
  if (!submitted) {
    throw new Error('Could not send host terminal command');
  }

  await waitFor(
    async () => {
      const result = await evaluate(
        Runtime,
        `(() => {
          const status = document.querySelector('.taskbar__window .taskbar__status')?.textContent?.trim() ?? '';
          const windowCount = document.querySelectorAll('.window-frame').length;
          const iconCount = document.querySelectorAll('.desktop-icon').length;
          const frame = document.querySelector('.window-frame[data-app-id="terminal"]');
          if (!(frame instanceof HTMLElement)) {
            return { status, windowCount, iconCount, ok: false };
          }
          const windowId = frame.dataset.windowId;
          const registry = globalThis.__AIONIOS_XTERM__;
          const terminal = windowId && registry ? registry[windowId] : null;
          const active = terminal?.buffer?.active;
          if (!active) {
            return { status, windowCount, iconCount, ok: false };
          }
          const start = Math.max(0, active.length - 80);
          let text = '';
          for (let i = start; i < active.length; i += 1) {
            const line = active.getLine(i);
            if (line) {
              text += line.translateToString(true) + '\\n';
            }
          }
          return {
            status,
            windowCount,
            iconCount,
            ok: text.includes('__AIONIOS_TERMINAL_OK__')
          };
        })()`
      );
      return (
        result.status === 'ready' &&
        result.windowCount === 1 &&
        result.iconCount >= 1 &&
        result.ok
      );
    },
    'Terminal command execution did not produce expected host output'
  );

  const openedPreference = await evaluate(
    Runtime,
    "(() => { const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Preference')); if (!icon) return false; icon.click(); return true; })()"
  );
  if (!openedPreference) {
    throw new Error('Failed to click Preference app icon');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "document.querySelector('.window-frame[data-app-id=\"preference\"] [data-pref-form]') instanceof HTMLElement"
        )
      ),
    'Preference form did not render'
  );

  const preferenceEdited = await evaluate(
    Runtime,
    `(() => {
      const frame = document.querySelector('.window-frame[data-app-id="preference"]');
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

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="preference"]');
            if (!(frame instanceof HTMLElement)) return false;
            const command = frame.querySelector('[data-pref-field="codex-command"]');
            const timeout = frame.querySelector('[data-pref-field="codex-timeout-ms"]');
            const shell = frame.querySelector('[data-pref-field="terminal-shell"]');
            if (!(command instanceof HTMLInputElement)) return false;
            if (!(timeout instanceof HTMLInputElement)) return false;
            if (!(shell instanceof HTMLInputElement)) return false;
            return command.value === ${JSON.stringify(PREFERENCE_EXPECTED.codexCommand)} &&
              timeout.value === ${JSON.stringify(String(PREFERENCE_EXPECTED.codexTimeoutMs))} &&
              shell.value === ${JSON.stringify(PREFERENCE_EXPECTED.terminalShell)};
          })()`
        )
      ),
    'Preference form fields were not updated'
  );

  const preferenceSubmitted = await evaluate(
    Runtime,
    `(() => {
      const button = document.querySelector('.window-frame[data-app-id="preference"] [data-pref-action="save"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`
  );
  if (!preferenceSubmitted) {
    throw new Error('Unable to submit Preference form');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "(() => (document.querySelector('.window-frame[data-app-id=\"preference\"] [data-pref-status]')?.textContent ?? '').includes('Preferences saved.'))()"
        )
      ),
    'Preference save did not complete'
  );

  const persistedConfig = await fetchJson(`${SERVER_URL}/api/config`);
  if (
    persistedConfig.llmBackend !== PREFERENCE_EXPECTED.llmBackend ||
    persistedConfig.codexCommand !== PREFERENCE_EXPECTED.codexCommand ||
    persistedConfig.codexTimeoutMs !== PREFERENCE_EXPECTED.codexTimeoutMs ||
    persistedConfig.terminalShell !== PREFERENCE_EXPECTED.terminalShell
  ) {
    throw new Error(
      `Preference API values mismatch: ${JSON.stringify(persistedConfig)}`
    );
  }

  const persistedToml = await fsPromises.readFile(configPath, 'utf8');
  const hasTimeout = /codex_timeout_ms\s*=\s*(54_321|54321)/.test(persistedToml);
  if (
    !persistedToml.includes('backend = "codex"') ||
    !hasTimeout ||
    !persistedToml.includes('shell = "/bin/sh"')
  ) {
    throw new Error('Preference config file does not contain expected persisted values');
  }

  const openedDirectory = await evaluate(
    Runtime,
    "(() => { const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Directory')); if (!icon) return false; icon.click(); return true; })()"
  );
  if (!openedDirectory) {
    throw new Error('Failed to click Directory app icon');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="directory"]');
            if (!(frame instanceof HTMLElement)) return false;
            return frame.querySelector('[data-directory-app]') instanceof HTMLElement &&
              frame.querySelector('[data-directory-list]') instanceof HTMLElement &&
              frame.querySelector('[data-directory-selected]') instanceof HTMLElement &&
              frame.querySelector('[data-directory-save]') instanceof HTMLButtonElement;
          })()`
        )
      ),
    'Directory app root/hooks did not render'
  );

  const directoryEdited = await evaluate(
    Runtime,
    `(() => {
      const frame = document.querySelector('.window-frame[data-app-id="directory"]');
      if (!(frame instanceof HTMLElement)) return false;
      const pathInput = frame.querySelector('input');
      const contentInput = frame.querySelector('textarea');
      const saveButton = frame.querySelector('[data-directory-save]');
      if (!(pathInput instanceof HTMLInputElement)) return false;
      if (!(contentInput instanceof HTMLTextAreaElement)) return false;
      if (!(saveButton instanceof HTMLButtonElement)) return false;
      const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!inputValueSetter || !textareaValueSetter) return false;
      inputValueSetter.call(pathInput, ${JSON.stringify(DIRECTORY_DRAFT_PATH)});
      pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      textareaValueSetter.call(contentInput, ${JSON.stringify(DIRECTORY_DRAFT_CONTENT)});
      contentInput.dispatchEvent(new Event('input', { bubbles: true }));
      saveButton.click();
      return true;
    })()`
  );
  if (!directoryEdited) {
    throw new Error('Unable to create/save a draft in Directory app');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="directory"]');
            if (!(frame instanceof HTMLElement)) return false;
            const selectedPath = frame.querySelector('[data-directory-selected]')?.textContent?.trim() ?? '';
            const listButtons = Array.from(frame.querySelectorAll('[data-directory-list] button'));
            const hasSavedEntry = listButtons.some(
              (button) => button.textContent?.trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)}
            );
            const draftContent = frame.querySelector('textarea')?.value ?? '';
            return selectedPath === ${JSON.stringify(DIRECTORY_DRAFT_PATH)} &&
              hasSavedEntry &&
              draftContent.includes(${JSON.stringify('Created by verify:cdp.')});
          })()`
        )
      ),
    'Directory save did not update UI state as expected'
  );

  const openedMedia = await evaluate(
    Runtime,
    "(() => { const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Media')); if (!icon) return false; icon.click(); return true; })()"
  );
  if (!openedMedia) {
    throw new Error('Failed to click Media app icon');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="media"]');
            if (!(frame instanceof HTMLElement)) return false;
            return frame.querySelector('[data-media-app]') instanceof HTMLElement &&
              frame.querySelector('[data-media-source]') instanceof HTMLInputElement &&
              frame.querySelector('[data-media-load]') instanceof HTMLButtonElement &&
              frame.querySelector('[data-media-player]') instanceof HTMLElement;
          })()`
        )
      ),
    'Media app root/hooks did not render'
  );

  const mediaLoaded = await evaluate(
    Runtime,
    `(() => {
      const frame = document.querySelector('.window-frame[data-app-id="media"]');
      if (!(frame instanceof HTMLElement)) return false;
      const sourceInput = frame.querySelector('[data-media-source]');
      const loadButton = frame.querySelector('[data-media-load]');
      if (!(sourceInput instanceof HTMLInputElement)) return false;
      if (!(loadButton instanceof HTMLButtonElement)) return false;
      const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!inputValueSetter) return false;
      inputValueSetter.call(sourceInput, ${JSON.stringify(MEDIA_SOURCE_DATA_URL)});
      sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
      loadButton.click();
      return true;
    })()`
  );
  if (!mediaLoaded) {
    throw new Error('Unable to load source in Media app');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const player = document.querySelector('.window-frame[data-app-id="media"] [data-media-player]');
            if (!(player instanceof HTMLElement)) return false;
            const image = player.querySelector('img');
            return image instanceof HTMLImageElement && image.src.startsWith('data:image/gif');
          })()`
        )
      ),
    'Media player did not update after loading source'
  );

  const openedEditor = await evaluate(
    Runtime,
    "(() => { const icon = Array.from(document.querySelectorAll('.desktop-icon')).find((item) => item.textContent?.includes('Editor')); if (!icon) return false; icon.click(); return true; })()"
  );
  if (!openedEditor) {
    throw new Error('Failed to click Editor app icon');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="editor"]');
            if (!(frame instanceof HTMLElement)) return false;
            return frame.querySelector('[data-editor-app]') instanceof HTMLElement &&
              frame.querySelector('[data-editor-files]') instanceof HTMLElement &&
              frame.querySelector('[data-editor-textarea]') instanceof HTMLTextAreaElement &&
              frame.querySelector('[data-editor-save]') instanceof HTMLButtonElement &&
              frame.querySelector('[data-editor-preview]') instanceof HTMLElement;
          })()`
        )
      ),
    'Editor app root/hooks did not render'
  );

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="editor"]');
            if (!(frame instanceof HTMLElement)) return false;
            const targetButton = Array.from(frame.querySelectorAll('[data-editor-files] button')).find(
              (button) => button.textContent?.trim() === ${JSON.stringify(DIRECTORY_DRAFT_PATH)}
            );
            if (!(targetButton instanceof HTMLButtonElement)) return false;
            targetButton.click();
            return true;
          })()`
        )
      ),
    'Editor file list did not expose saved Directory draft'
  );

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const textarea = document.querySelector('.window-frame[data-app-id="editor"] [data-editor-textarea]');
            return textarea instanceof HTMLTextAreaElement && textarea.value.includes('Directory CDP check');
          })()`
        )
      ),
    'Editor did not load selected file content'
  );

  const editorEdited = await evaluate(
    Runtime,
    `(() => {
      const frame = document.querySelector('.window-frame[data-app-id="editor"]');
      if (!(frame instanceof HTMLElement)) return false;
      const textarea = frame.querySelector('[data-editor-textarea]');
      if (!(textarea instanceof HTMLTextAreaElement)) return false;
      const textareaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!textareaValueSetter) return false;
      const nextValue = textarea.value + '\\n' + ${JSON.stringify(EDITOR_MARKER)};
      textareaValueSetter.call(textarea, nextValue);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`
  );
  if (!editorEdited) {
    throw new Error('Unable to edit file content in Editor app');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "(() => { const saveButton = document.querySelector('.window-frame[data-app-id=\"editor\"] [data-editor-save]'); return saveButton instanceof HTMLButtonElement && !saveButton.disabled; })()"
        )
      ),
    'Editor save button did not become enabled after edit'
  );

  const editorSaved = await evaluate(
    Runtime,
    `(() => {
      const saveButton = document.querySelector('.window-frame[data-app-id="editor"] [data-editor-save]');
      if (!(saveButton instanceof HTMLButtonElement)) return false;
      saveButton.click();
      return true;
    })()`
  );
  if (!editorSaved) {
    throw new Error('Unable to save edited file in Editor app');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          `(() => {
            const frame = document.querySelector('.window-frame[data-app-id="editor"]');
            if (!(frame instanceof HTMLElement)) return false;
            const preview = frame.querySelector('[data-editor-preview]');
            if (!(preview instanceof HTMLElement)) return false;
            const statusSaved = (frame.textContent ?? '').includes(${JSON.stringify(`Saved ${DIRECTORY_DRAFT_PATH}.`)});
            const previewText = preview.textContent ?? '';
            const hasHighlightedMarkup =
              preview.innerHTML.includes('class="shiki') || preview.innerHTML.includes("class='shiki");
            return statusSaved && hasHighlightedMarkup && previewText.includes(${JSON.stringify(EDITOR_MARKER)});
          })()`
        )
      ),
    'Editor save status/preview did not reflect edited content'
  );

  const finalState = await evaluate(
    Runtime,
    "(() => ({ windows: document.querySelectorAll('.window-frame').length, icons: document.querySelectorAll('.desktop-icon').length, preferenceStatus: document.querySelector('.window-frame[data-app-id=\"preference\"] [data-pref-status]')?.textContent?.trim() ?? '' }))()"
  );
  if (finalState.windows < 2 || finalState.icons < 2) {
    throw new Error(`Unexpected final desktop state: ${JSON.stringify(finalState)}`);
  }
  console.log('[verify:cdp] success:', finalState);
  console.log('[verify:cdp] config path:', configPath);
  console.log('[verify:cdp] logs:', logDir);
}

async function cleanup() {
  if (cdpClient) {
    try {
      await cdpClient.close();
    } catch {
      // ignore cleanup errors
    }
  }
  if (chrome && !chrome.killed) {
    chrome.kill('SIGTERM');
    await delay(400);
    if (!chrome.killed) {
      chrome.kill('SIGKILL');
    }
  }
  if (devServer && !devServer.killed) {
    devServer.kill('SIGTERM');
    await delay(400);
    if (!devServer.killed) {
      devServer.kill('SIGKILL');
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('[verify:cdp] failed:', error);
  console.error('[verify:cdp] logs:', logDir);
  process.exitCode = 1;
} finally {
  await cleanup();
}
