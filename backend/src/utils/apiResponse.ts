import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '../types';

/**
 * Response helpers. Routing every reply through these is what makes the
 * `{ success, data, meta }` envelope actually consistent — the mobile client
 * unwraps exactly one shape, forever.
 */
export const ok = <T>(res: Response, data: T, meta?: ApiSuccess<T>['meta']): Response =>
  res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });

export const created = <T>(res: Response, data: T): Response =>
  res.status(201).json({ success: true, data });

export const noContent = (res: Response): Response => res.status(204).send();

export const paginated = <T>(res: Response, items: T[], meta: PaginationMeta): Response =>
  res.status(200).json({ success: true, data: items, meta });
