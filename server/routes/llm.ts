import type { Express } from 'express';
import { badRequest } from '../http/responses';
import { parseNonEmptyString } from '../http/validation';
import { WindowOrchestrator } from '../orchestrator';
import type { ArtifactMetadataKind } from '../orchestrator/types';

function isArtifactMetadataKind(value: unknown): value is ArtifactMetadataKind {
  return value === 'window' || value === 'app' || value === 'file';
}

export function registerLlmRoutes(
  app: Express,
  deps: { orchestrator: WindowOrchestrator }
) {
  const { orchestrator } = deps;

  app.post('/api/llm/artifact-metadata', async (request, response) => {
    const { instruction, kind, extension, appId, title } = request.body as {
      instruction?: unknown;
      kind?: unknown;
      extension?: unknown;
      appId?: unknown;
      title?: unknown;
    };

    const parsedInstruction = parseNonEmptyString(instruction);
    if (!parsedInstruction) {
      badRequest(response, 'instruction is required.');
      return;
    }
    if (!isArtifactMetadataKind(kind)) {
      badRequest(response, 'kind must be one of: window, app, file.');
      return;
    }
    if (extension !== undefined && typeof extension !== 'string') {
      badRequest(response, 'extension must be a string when provided.');
      return;
    }
    if (appId !== undefined && typeof appId !== 'string') {
      badRequest(response, 'appId must be a string when provided.');
      return;
    }
    if (title !== undefined && typeof title !== 'string') {
      badRequest(response, 'title must be a string when provided.');
      return;
    }

    const metadata = await orchestrator.suggestArtifactMetadata({
      kind,
      instruction: parsedInstruction,
      extension: typeof extension === 'string' ? extension : undefined,
      appId: typeof appId === 'string' ? appId : undefined,
      title: typeof title === 'string' ? title : undefined
    });

    response.status(200).json(metadata);
  });
}
