import type { Request, Response } from 'express';
import * as orderService from '../services/order.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, paginated } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';

export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await orderService.checkout(user, req.body));
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await orderService.listOrders(user, req.query as never);
  return paginated(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await orderService.getOrderById(req.params.id as string, user));
});
