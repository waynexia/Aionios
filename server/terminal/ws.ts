import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { WindowOrchestrator } from '../orchestrator';
import type { TerminalManager } from './manager';

type TerminalClientMessage =
  | {
      type: 'start';
      cols: number;
      rows: number;
    }
  | {
      type: 'input';
      data: string;
    }
  | {
      type: 'resize';
      cols: number;
      rows: number;
    }
  | {
      type: 'stop';
    };

type TerminalServerMessage =
  | {
      type: 'ready';
      shell: string;
      cwd: string;
      cols: number;
      rows: number;
    }
  | {
      type: 'data';
      data: string;
    }
  | {
      type: 'error';
      message: string;
    };

function parseTerminalWsPath(pathname: string): { sessionId: string; windowId: string } | null {
  const match = pathname.match(
    /^\/api\/sessions\/([^/]+)\/windows\/([^/]+)\/terminal\/ws$/
  );
  if (!match) {
    return null;
  }
  try {
    return {
      sessionId: decodeURIComponent(match[1]),
      windowId: decodeURIComponent(match[2])
    };
  } catch {
    return null;
  }
}

function parseClientMessage(raw: unknown): TerminalClientMessage | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const type = parsed.type;
    if (type === 'start') {
      const cols = parsed.cols;
      const rows = parsed.rows;
      if (typeof cols !== 'number' || typeof rows !== 'number') {
        return null;
      }
      return { type, cols, rows };
    }
    if (type === 'input') {
      const data = parsed.data;
      if (typeof data !== 'string') {
        return null;
      }
      return { type, data };
    }
    if (type === 'resize') {
      const cols = parsed.cols;
      const rows = parsed.rows;
      if (typeof cols !== 'number' || typeof rows !== 'number') {
        return null;
      }
      return { type, cols, rows };
    }
    if (type === 'stop') {
      return { type };
    }
    return null;
  } catch {
    return null;
  }
}

function sendJson(socket: WebSocket, payload: TerminalServerMessage) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

export function attachTerminalWebSocketServer(options: {
  server: HttpServer;
  orchestrator: WindowOrchestrator;
  terminalManager: TerminalManager;
}) {
  const wss = new WebSocketServer({ noServer: true });
  const { server, orchestrator, terminalManager } = options;

  server.on('upgrade', (request, socket, head) => {
    const url = request.url;
    if (!url) {
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(url, 'http://localhost').pathname;
    } catch {
      return;
    }
    const params = parseTerminalWsPath(pathname);
    if (!params) {
      return;
    }

    try {
      const snapshot = orchestrator.getWindowSnapshot(params.sessionId, params.windowId);
      if (snapshot.appId !== 'terminal') {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      let started = false;
      let unsubscribe: (() => void) | null = null;

      const teardown = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (started) {
          terminalManager.close(params.sessionId, params.windowId);
        }
      };

      ws.on('close', teardown);
      ws.on('error', teardown);

      ws.on('message', (data) => {
        const message = parseClientMessage(data.toString('utf8'));
        if (!message) {
          sendJson(ws, { type: 'error', message: 'Invalid terminal message.' });
          return;
        }

        if (message.type === 'start') {
          try {
            const metadata = terminalManager.start(params.sessionId, params.windowId, {
              cols: message.cols,
              rows: message.rows
            });
            started = true;
            sendJson(ws, {
              type: 'ready',
              shell: metadata.shell,
              cwd: metadata.cwd,
              cols: metadata.cols,
              rows: metadata.rows
            });
            if (unsubscribe) {
              unsubscribe();
            }
            unsubscribe = terminalManager.subscribe(params.sessionId, params.windowId, (chunk) => {
              sendJson(ws, { type: 'data', data: chunk });
            });
          } catch (error) {
            sendJson(ws, { type: 'error', message: (error as Error).message });
          }
          return;
        }

        if (!started) {
          sendJson(ws, { type: 'error', message: 'Terminal is not started yet.' });
          return;
        }

        if (message.type === 'input') {
          if (!message.data) {
            return;
          }
          try {
            terminalManager.write(params.sessionId, params.windowId, message.data);
          } catch (error) {
            sendJson(ws, { type: 'error', message: (error as Error).message });
          }
          return;
        }

        if (message.type === 'resize') {
          try {
            terminalManager.resize(params.sessionId, params.windowId, message.cols, message.rows);
          } catch (error) {
            sendJson(ws, { type: 'error', message: (error as Error).message });
          }
          return;
        }

        if (message.type === 'stop') {
          teardown();
          try {
            ws.close();
          } catch {
            // ignore close failures
          }
        }
      });
    });
  });
}
