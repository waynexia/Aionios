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

const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aionios-cdp-'));
const logDir = path.join(tmpDir, 'logs');
const chromeProfileDir = path.join(tmpDir, 'chrome-profile');
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
  const { Page, Runtime } = cdpClient;
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

  const started = await evaluate(
    Runtime,
    "(() => { const frame = document.querySelector('.window-frame[data-app-id=\"terminal\"]'); if (!(frame instanceof HTMLElement)) return false; const sessionId = frame.dataset.sessionId; const windowId = frame.dataset.windowId; if (!sessionId || !windowId) return false; return fetch(`/api/sessions/${sessionId}/windows/${windowId}/terminal/start`, { method: 'POST' }).then((response) => response.ok); })()"
  );
  if (!started) {
    throw new Error('Could not start host terminal session');
  }

  await waitFor(
    async () =>
      Boolean(
        await evaluate(
          Runtime,
          "document.querySelector('.window-frame[data-app-id=\"terminal\"] pre') instanceof HTMLElement"
        )
      ),
    'Terminal output panel is not available'
  );

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
        "(() => ({ status: document.querySelector('.taskbar__window .taskbar__status')?.textContent?.trim() ?? '', output: document.querySelector('.window-frame pre')?.textContent ?? '', windowCount: document.querySelectorAll('.window-frame').length, iconCount: document.querySelectorAll('.desktop-icon').length }))()"
      );
      return (
        result.status === 'ready' &&
        result.windowCount === 1 &&
        result.iconCount >= 1 &&
        result.output.includes('__AIONIOS_TERMINAL_OK__')
      );
    },
    'Terminal command execution did not produce expected host output'
  );

  const finalState = await evaluate(
    Runtime,
    "(() => ({ title: document.querySelector('.window-frame__title span')?.textContent ?? '', status: document.querySelector('.taskbar__window .taskbar__status')?.textContent?.trim() ?? '', windows: document.querySelectorAll('.window-frame').length, icons: document.querySelectorAll('.desktop-icon').length }))()"
  );
  console.log('[verify:cdp] success:', finalState);
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
