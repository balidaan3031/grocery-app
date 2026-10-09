import type { Request, Response } from 'express';
import { getDashboard } from '../services/dashboard.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { trendDays, recentLimit, lowStockLimit } = req.query as unknown as {
    trendDays: number;
    recentLimit: number;
    lowStockLimit: number;
  };

  return ok(res, await getDashboard(user, { trendDays, recentLimit, lowStockLimit }));
});
