import type { Express } from 'express';
import {
  badRequest,
  internalError,
  jsonErrorForErrnoNotFound,
  jsonErrorForNotFoundOrBadRequest,
  notFound
} from '../http/responses';
import { parseNonEmptyString } from '../http/validation';
import { HostFileSystem } from '../storage/host-fs';
import { RecycleBinItemNotFoundError, RecycleBinStore } from '../storage/recycle-bin';

export function registerRecycleBinRoutes(
  app: Express,
  deps: { hostFs: HostFileSystem; recycleBinStore: RecycleBinStore }
) {
  const { hostFs, recycleBinStore } = deps;

  app.get('/api/recycle-bin/items', async (_request, response) => {
    try {
      const items = await recycleBinStore.listItems();
      response.status(200).json({ items });
    } catch (error) {
      internalError(response, (error as Error).message);
    }
  });

  app.post('/api/recycle-bin/trash', async (request, response) => {
    const { path: virtualPathValue } = request.body as { path?: unknown };
    const virtualPath = parseNonEmptyString(virtualPathValue);
    if (!virtualPath) {
      badRequest(response, 'path is required.');
      return;
    }

    try {
      const trashed = await recycleBinStore.trashHostFile(hostFs, virtualPath);
      response.status(201).json(trashed);
    } catch (error) {
      jsonErrorForErrnoNotFound(response, error);
    }
  });

  app.post('/api/recycle-bin/items/:id/restore', async (request, response) => {
    const { id } = request.params;
    try {
      const restored = await recycleBinStore.restoreItem(hostFs, id);
      response.status(200).json(restored);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const isNotFound = code === 'ENOENT' || error instanceof RecycleBinItemNotFoundError;
      jsonErrorForNotFoundOrBadRequest(response, error, isNotFound);
    }
  });

  app.delete('/api/recycle-bin/items/:id', async (request, response) => {
    const { id } = request.params;
    try {
      const deleted = await recycleBinStore.deleteItem(id);
      if (!deleted) {
        notFound(response, 'Recycle bin item not found.');
        return;
      }
      response.status(200).json({ deleted: true });
    } catch (error) {
      badRequest(response, (error as Error).message);
    }
  });

  app.post('/api/recycle-bin/empty', async (_request, response) => {
    try {
      const emptied = await recycleBinStore.empty();
      response.status(200).json(emptied);
    } catch (error) {
      internalError(response, (error as Error).message);
    }
  });
}

