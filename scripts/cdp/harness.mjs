import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import CDP from 'chrome-remote-interface';

const VERIFY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 400;

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to resolve an available TCP port.')));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

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

export async function waitFor(check, message, timeoutMs = VERIFY_TIMEOUT_MS) {
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

export async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.json();
}

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

export async function createCdpHarness(options = {}) {
  const serverPort = await getFreePort();
  const serverUrl = `http://localhost:${String(serverPort)}`;
  const cdpPort = options.cdpPort ?? 9222;
  const headless = options.headless ?? true;

  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'aionios-cdp-'));
  const logDir = path.join(tmpDir, 'logs');
  const chromeProfileDir = path.join(tmpDir, 'chrome-profile');
  const configPath = path.join(tmpDir, 'preferences.toml');

  await fsPromises.mkdir(logDir, { recursive: true });
  await fsPromises.mkdir(chromeProfileDir, { recursive: true });

  let devServer;
  let chrome;
  let cdpClient;

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

  async function start() {
    console.log('[verify:cdp] temp dir:', tmpDir);

    await fsPromises.writeFile(
      configPath,
      [
        '[server]',
        `port = ${String(serverPort)}`,
        'disable_hmr = true',
        '',
        '[llm]',
        'backend = "mock"',
        'codex_command = "codex exec --skip-git-repo-check"',
        'codex_timeout_ms = 120000',
        'stream_output = false',
        '',
        '[terminal]',
        'shell = "/bin/bash"',
        ''
      ].join('\n'),
      'utf8'
    );

    devServer = spawn('npm', ['run', 'dev', '--', '--config-path', configPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    streamProcessOutput(devServer, path.join(logDir, 'dev-server.log'), 'dev-server');

    await waitFor(async () => {
      try {
        const response = await fetch(serverUrl);
        return response.ok;
      } catch {
        return false;
      }
    }, 'Dev server did not become ready');

    const chromeArgs = [
      ...(headless ? ['--headless=new'] : []),
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${String(cdpPort)}`,
      `--user-data-dir=${chromeProfileDir}`,
      serverUrl
    ];

    chrome = spawn('google-chrome-stable', chromeArgs, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    streamProcessOutput(chrome, path.join(logDir, 'chrome.log'), 'chrome');

    const debugUrl = `http://127.0.0.1:${String(cdpPort)}/json`;

    await waitFor(async () => {
      try {
        const targets = await fetchJson(debugUrl);
        return Array.isArray(targets) && targets.length > 0;
      } catch {
        return false;
      }
    }, 'Chrome remote debugging endpoint is not available');

    const targets = await fetchJson(debugUrl);
    const target = targets.find((item) =>
      String(item.url ?? '').includes(`localhost:${String(serverPort)}`)
    );
    if (!target) {
      throw new Error(`Cannot find target page for ${serverUrl} from Chrome remote debugging list`);
    }

    cdpClient = await CDP({ target, port: cdpPort });
    const { Page, Runtime, Input } = cdpClient;

    await Page.enable();
    await Runtime.enable();

    await Page.navigate({ url: serverUrl });
    await Page.loadEventFired();

    return {
      serverPort,
      serverUrl,
      tmpDir,
      logDir,
      chromeProfileDir,
      configPath,
      cdpPort,
      Page,
      Runtime,
      Input,
      fetchJson,
      waitFor,
      delay,
      evaluate: (expression) => evaluate(Runtime, expression)
    };
  }

  return {
    serverPort,
    serverUrl,
    tmpDir,
    logDir,
    chromeProfileDir,
    configPath,
    cdpPort,
    start,
    cleanup
  };
}
