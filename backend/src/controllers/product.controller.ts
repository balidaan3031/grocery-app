import type { Request, Response } from 'express';
import * as productService from '../services/product.service';
import * as inventoryService from '../services/inventory.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, ok, paginated } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';
import { ApiError } from '../utils/ApiError';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await productService.listProducts(req.query as never);
  return paginated(res, result.items, result.meta);
});

export const getById = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await productService.getProductById(req.params.id as string)),
);

/**
 * The scanner's lookup endpoint.
 *
 * A miss is a 404 carrying the barcode back, which is what lets the app offer
 * "add this product" pre-filled instead of a dead end. A deactivated product is
 * a 409 PRODUCT_INACTIVE instead: it still owns the barcode, so "add this
 * product" would only fail.
 */
export const getByBarcode = asyncHandler(async (req: Request, res: Response) => {
  const barcode = req.params.barcode as string;
  const product = await productService.findProductByBarcode(barcode, { includeInactive: true });

  if (!product) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', `No product matches barcode ${barcode}`, {
      barcode,
    });
  }

  if (!product.is_active) throw ApiError.productInactive(product, barcode);

  return ok(res, product);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return created(res, await productService.createProduct(req.body, user.id));
});

export const update = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await productService.updateProduct(req.params.id as string, req.body)),
);

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const permanent = (req.query as { permanent?: boolean }).permanent === true;
  const result = await productService.deleteProduct(req.params.id as string, { permanent });
  return ok(res, result);
});

export const restore = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await productService.restoreProduct(req.params.id as string)),
);

/** Stock ledger for one product, shown on the product detail screen. */
export const movements = asyncHandler(async (req: Request, res: Response) =>
  ok(res, await inventoryService.getProductMovements(req.params.id as string)),
);
