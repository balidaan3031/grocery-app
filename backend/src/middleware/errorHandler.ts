import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { env } from '../config/env';
import type { ApiFailure } from '../types';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
};

const normalise = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation(
      'Request failed validation',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  // express.json() rejects malformed payloads with a SyntaxError carrying a status.
  if (error instanceof SyntaxError && 'body' in error) {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  return ApiError.internal();
};

/**
 * The one place an error becomes a response.
 *
 * Unexpected errors are logged with their full stack but answered with a
 * generic message — internals (table names, stack frames, driver messages) are
 * never leaked to a client in production.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const apiError = normalise(error);
  const unexpected = !(error instanceof ApiError);

  const logPayload = {
    err: error,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    statusCode: apiError.statusCode,
  };

  if (apiError.statusCode >= 500) {
    logger.error(logPayload, apiError.message);
  } else {
    logger.warn(logPayload, apiError.message);
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
    },
  };

  // Stacks are useful locally and a disclosure risk anywhere else.
  if (unexpected && !env.isProduction && error instanceof Error) {
    body.error.details = { message: error.message, stack: error.stack?.split('\n').slice(0, 6) };
  }

  res.status(apiError.statusCode).json(body);
};
