import type { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/apiResponse';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { includeInactive, withCounts } = req.query as unknown as {
    includeInactive?: boolean;
    withCounts?: boolean;
  };
  return ok(res, await categoryService.listCategories({ includeInactive, withCounts }));
});

export const getById = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await categoryService.getCategoryById(req.params.id as string)),
);

export const create = asyncHandler(async (req: Request, res: Response) =>
  created(res, await categoryService.createCategory(req.body)),
);

export const update = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await categoryService.updateCategory(req.params.id as string, req.body)),
);

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await categoryService.deleteCategory(req.params.id as string);
  return noContent(res);
});
