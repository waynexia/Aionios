import { type Response } from 'express';

export function jsonError(response: Response, status: number, message: string) {
  response.status(status).json({ message });
}

export function badRequest(response: Response, message: string) {
  jsonError(response, 400, message);
}

export function notFound(response: Response, message: string) {
  jsonError(response, 404, message);
}

export function internalError(response: Response, message: string) {
  jsonError(response, 500, message);
}

export function jsonErrorForNotFoundOrBadRequest(response: Response, error: unknown, isNotFound: boolean) {
  jsonError(response, isNotFound ? 404 : 400, (error as Error).message);
}

export function jsonErrorForErrnoNotFound(response: Response, error: unknown) {
  jsonErrorForNotFoundOrBadRequest(
    response,
    error,
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
