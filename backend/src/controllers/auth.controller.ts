import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/apiResponse';
import { requireUser } from '../utils/requestUser';
import { ApiError } from '../utils/ApiError';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  return ok(res, result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.accessToken) await authService.logout(req.accessToken);
  return noContent(res);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken);
  return ok(res, result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await authService.getCurrentUser(user.id));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  return ok(res, await authService.updateProfile(user.id, req.body));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { currentPassword, newPassword } = req.body;

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from the current one');
  }

  await authService.changePassword(user, currentPassword, newPassword);
  return noContent(res);
});

export const createStaff = asyncHandler(async (req: Request, res: Response) =>
  created(res, await authService.createStaffAccount(req.body)),
);

export const listStaff = asyncHandler(async (_req: Request, res: Response) =>
  ok(res, await authService.listStaff()),
);

export const setStaffActive = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const targetId = req.params.id as string;

  // Locking yourself out of the only admin account is unrecoverable from inside
  // the app, so self-deactivation is refused.
  if (targetId === actor.id && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  return ok(res, await authService.setUserActive(targetId, req.body.isActive));
});

export const updateStaff = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const targetId = req.params.id as string;

  // Same reasoning as self-deactivation. Together the two rules guarantee an
  // active admin always remains: the caller is one, and cannot stop being one.
  if (targetId === actor.id && req.body.role !== undefined && req.body.role !== 'admin') {
    throw ApiError.badRequest('You cannot remove your own admin role');
  }

  return ok(res, await authService.updateStaffAccount(targetId, req.body));
});

export const resetStaffPassword = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const targetId = req.params.id as string;

  // Your own password goes through /me/password, which demands the current one
  // — otherwise a stolen admin token alone could take over the admin account.
  if (targetId === actor.id) {
    throw ApiError.badRequest('Change your own password from your profile');
  }

  await authService.resetUserPassword(targetId, req.body.password);
  return noContent(res);
});
