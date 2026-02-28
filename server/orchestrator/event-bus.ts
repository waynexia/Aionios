import type { Response } from 'express';
import type { WindowEvent } from './types';

interface SessionConnection {
  response: Response;
  heartbeatId: NodeJS.Timeout;
}

function writeSseMessage(response: Response, event: WindowEvent) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export class SessionEventBus {
  private readonly connections = new Map<string, Set<SessionConnection>>();

  subscribe(sessionId: string, response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const heartbeatId = setInterval(() => {
      response.write(': heartbeat\n\n');
    }, 20_000);

    const connection: SessionConnection = {
      response,
      heartbeatId
    };
    const existing = this.connections.get(sessionId) ?? new Set<SessionConnection>();
    existing.add(connection);
    this.connections.set(sessionId, existing);

    response.on('close', () => {
      clearInterval(heartbeatId);
      existing.delete(connection);
      if (existing.size === 0) {
        this.connections.delete(sessionId);
      }
      response.end();
    });
  }

  publish(event: WindowEvent) {
    const sessionConnections = this.connections.get(event.sessionId);
    if (!sessionConnections) {
      return;
    }
    for (const connection of sessionConnections) {
      writeSseMessage(connection.response, event);
    }
  }
}
