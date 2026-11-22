import type { ApiErrorBody } from '@isp/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logger/logger.js';
import { AppError, NotFoundError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new NotFoundError());

function isBodyParserError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string' &&
    (error as { type: string }).type.startsWith('entity.')
  );
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) return next(error);

    let status = 500;
    let body: ApiErrorBody['error'] = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: [],
      requestId: req.requestId,
    };

    if (error instanceof AppError) {
      status = error.status;
      body = {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.requestId,
      };
    } else if (isBodyParserError(error)) {
      status = error.status >= 400 && error.status < 500 ? error.status : 400;
      body = {
        code: 'VALIDATION_ERROR',
        message: 'The request body could not be read.',
        details: [],
        requestId: req.requestId,
      };
    } else {
      logger.error({ err: error, requestId: req.requestId }, 'Unhandled error');
    }

    res.status(status).json({ error: body } satisfies ApiErrorBody);
  };
}
