import type { Express } from 'express';
import { nanoid } from 'nanoid';
import { badRequest } from '../http/responses';
import { parseNonEmptyString } from '../http/validation';
import { createAppDescriptor, listAppDescriptors } from '../storage/app-descriptors';
import { HostFileSystem } from '../storage/host-fs';

export function registerAppRoutes(app: Express, deps: { hostFs: HostFileSystem }) {
  const { hostFs } = deps;

  app.get('/api/apps', async (request, response) => {
    const directory = request.query.directory;
    if (directory !== undefined && typeof directory !== 'string') {
      badRequest(response, 'directory must be a string when provided.');
      return;
    }
    try {
      const apps = await listAppDescriptors(
        hostFs,
        typeof directory === 'string' ? { directory } : undefined
      );
      response.status(200).json({ apps });
    } catch (error) {
      badRequest(response, (error as Error).message);
    }
  });

  app.post('/api/apps', async (request, response) => {
    const { directory, title, icon } = request.body as {
      directory?: unknown;
      title?: unknown;
      icon?: unknown;
    };
    if (directory !== undefined && typeof directory !== 'string') {
      badRequest(response, 'directory must be a string when provided.');
      return;
    }
    const parsedTitle = parseNonEmptyString(title);
    if (!parsedTitle) {
      badRequest(response, 'title is required.');
      return;
    }
    if (icon !== undefined && typeof icon !== 'string') {
      badRequest(response, 'icon must be a string when provided.');
      return;
    }

    const appId = `app-${nanoid(10)}`;
    try {
      const descriptor = await createAppDescriptor(hostFs, {
        directory,
        appId,
        title: parsedTitle.trim(),
        icon
      });
      response.status(201).json(descriptor);
    } catch (error) {
      badRequest(response, (error as Error).message);
    }
  });
}

