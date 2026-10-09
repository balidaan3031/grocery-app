import type { Request, Response } from 'express';
import * as inventoryService from '../services/inventory.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, paginated } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';
import { ApiError } from '../utils/ApiError';
import { idempotencyKey } from '../validators/common.validator';

/**
 * The key may come in the body (what the app sends) or as the conventional
 * `Idempotency-Key` header. A header that is present but malformed is refused
 * rather than ignored: silently dropping it would make the caller believe its
 * retries are safe when they are not.
 */
const readIdempotencyKey = (req: Request): string | null => {
  const fromBody = (req.body as { idempotencyKey?: string }).idempotencyKey;
  if (fromBody) return fromBody;

  const header = req.get('Idempotency-Key');
  if (!header) return null;

  const parsed = idempotencyKey.safeParse(header.trim());
  if (!parsed.success) {
    throw ApiError.validation('Request failed validation', [
      { field: 'Idempotency-Key', message: 'Idempotency key must be a UUID' },
    ]);
  }
  return parsed.data;
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listInventory(req.query as never);
  return paginated(res, result.items, result.meta);
});

export const summary = asyncHandler(async (_req: Request, res: Response) =>
  ok(res, await inventoryService.getInventorySummary()),
);

export const lowStock = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query as unknown as { limit: number };
  return ok(res, await inventoryService.getLowStockProducts(limit));
});

/**
 * Manual stock change. `quantityChange` is signed — positive restocks, negative
 * writes off — and always produces a ledger row naming who did it and why.
 * A repeated idempotency key returns the original movement instead of a new one.
 */
export const adjust = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const movement = await inventoryService.adjustStock({
    productId: req.params.productId as string,
    quantityChange: req.body.quantityChange,
    type: req.body.type,
    reason: req.body.reason ?? null,
    userId: user.id,
    referenceType: 'manual',
    idempotencyKey: readIdempotencyKey(req),
  });

  return created(res, movement);
});

/** Stock count: sets the quantity to what is on the shelf, as one locked operation. */
export const count = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await inventoryService.countStock({
    productId: req.params.productId as string,
    countedQuantity: req.body.countedQuantity,
    reason: req.body.reason ?? null,
    userId: user.id,
    idempotencyKey: readIdempotencyKey(req),
  });

  return result.changed && !result.replayed ? created(res, result) : ok(res, result);
});

export const movements = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.listMovements(req.query as never);
  return paginated(res, result.items, result.meta);
});

export const productMovements = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await inventoryService.getProductMovements(req.params.productId as string)),
);
