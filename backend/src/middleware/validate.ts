import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

export interface RequestSchema {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

const formatIssues = (error: ZodError) =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));

/**
 * Validates and — importantly — *replaces* the request parts with the parsed
 * output. Downstream handlers therefore receive coerced, defaulted, trimmed
 * values and never have to re-check a type they were promised.
 */
export const validate =
  (schema: RequestSchema): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.params) req.params = schema.params.parse(req.params);
      if (schema.query) {
        // req.query is a getter-only property on some Express versions, so the
        // parsed value is assigned via defineProperty rather than `=`.
        const parsedQuery = schema.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schema.body) req.body = schema.body.parse(req.body);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(ApiError.validation('Request failed validation', formatIssues(error)));
      }
      return next(error);
    }
  };
