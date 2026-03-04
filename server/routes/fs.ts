import type { Express } from 'express';
import { badRequest, internalError, jsonErrorForErrnoNotFound } from '../http/responses';
import { parseNonEmptyString } from '../http/validation';
import { HostFileSystem } from '../storage/host-fs';

export function registerFileSystemRoutes(app: Express, deps: { hostFs: HostFileSystem }) {
  const { hostFs } = deps;

  app.get('/api/fs/files', async (_request, response) => {
    try {
      const files = await hostFs.listFiles();
      response.status(200).json({ files });
    } catch (error) {
      internalError(response, (error as Error).message);
    }
  });

  app.get('/api/fs/file', async (request, response) => {
    const requestedPath = parseNonEmptyString(request.query.path);
    if (!requestedPath) {
      badRequest(response, 'path is required.');
      return;
    }

    try {
      const content = await hostFs.readFile(requestedPath);
      response.status(200).json({ content });
    } catch (error) {
      jsonErrorForErrnoNotFound(response, error);
    }
  });

  app.put('/api/fs/file', async (request, response) => {
    const { path: virtualPathValue, content } = request.body as { path?: unknown; content?: unknown };
    const virtualPath = parseNonEmptyString(virtualPathValue);
    if (!virtualPath) {
      badRequest(response, 'path is required.');
      return;
    }
    if (typeof content !== 'string') {
      badRequest(response, 'content must be a string.');
      return;
    }

    try {
      await hostFs.writeFile(virtualPath, content);
      response.status(200).json({ ok: true });
    } catch (error) {
      badRequest(response, (error as Error).message);
    }
  });
}

