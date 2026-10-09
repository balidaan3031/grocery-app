import type { Request, Response } from 'express';
import * as cartService from '../services/cart.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';

export const getActive = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await cartService.getActiveCart(user.id));
});

/**
 * Add by product id or barcode.
 *
 * The response carries the full cart *and* the product that was just added,
 * so the scanner can show "Added · Amul Milk · ×2" and the running total from a
 * single round trip — no follow-up fetch between scans.
 */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await cartService.addItemToCart(user.id, req.body);
  return ok(res, result);
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const cart = await cartService.updateCartItemQuantity(
    user.id,
    req.params.itemId as string,
    req.body.quantity,
  );
  return ok(res, cart);
});

export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await cartService.removeCartItem(user.id, req.params.itemId as string));
});

export const clear = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await cartService.clearCart(user.id));
});
