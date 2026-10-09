import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimit';
import {
  changePasswordSchema,
  createStaffSchema,
  loginSchema,
  refreshSchema,
  resetStaffPasswordSchema,
  setStaffStatusSchema,
  updateProfileSchema,
  updateStaffSchema,
} from '../validators/auth.validator';

const router = Router();

// -- public ------------------------------------------------------------------
router.post('/login', authRateLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);

// -- authenticated -----------------------------------------------------------
router.use(authenticate);

router.post('/logout', controller.logout);
router.get('/me', controller.me);
router.patch('/me', validate(updateProfileSchema), controller.updateProfile);
router.post('/me/password', validate(changePasswordSchema), controller.changePassword);

// -- admin -------------------------------------------------------------------
router.get('/users', requireAdmin, controller.listStaff);
router.post('/users', requireAdmin, validate(createStaffSchema), controller.createStaff);
router.patch('/users/:id', requireAdmin, validate(updateStaffSchema), controller.updateStaff);
router.patch(
  '/users/:id/status',
  requireAdmin,
  validate(setStaffStatusSchema),
  controller.setStaffActive,
);
router.post(
  '/users/:id/password',
  requireAdmin,
  validate(resetStaffPasswordSchema),
  controller.resetStaffPassword,
);

export default router;
