import type { Express } from 'express';
import { PreferenceConfigStore } from '../config';
import { jsonError } from '../http/responses';

export function registerConfigRoutes(
  app: Express,
  deps: {
    preferenceConfigStore: PreferenceConfigStore;
  }
) {
  const { preferenceConfigStore } = deps;

  app.get('/api/config', (_request, response) => {
    response.status(200).json(preferenceConfigStore.getConfig());
  });

  app.put('/api/config', async (request, response) => {
    try {
      const updated = await preferenceConfigStore.update(request.body);
      response.status(200).json(updated);
    } catch (error) {
      const message = (error as Error).message;
      const isValidationError =
        message.includes('Unknown preference') ||
        message.includes('must be') ||
        message.includes('payload');
      jsonError(response, isValidationError ? 400 : 500, message);
    }
  });
}

