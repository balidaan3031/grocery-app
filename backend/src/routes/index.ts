import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import cartRoutes from './cart.routes';
import orderRoutes from './order.routes';
import inventoryRoutes from './inventory.routes';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { dashboardSchema } from '../validators/order.validator';
import { env } from '../config/env';
import { ok } from '../utils/apiResponse';

const router = Router();

/**
 * Client bootstrap. Lets the app label prices and the store without shipping a
 * second copy of that configuration inside the bundle.
 */
router.get('/config', (_req, res) =>
  ok(res, {
    storeName: env.STORE_NAME,
    currencyCode: env.CURRENCY_CODE,
    currencySymbol: env.CURRENCY_SYMBOL,
    supabaseUrl: env.SUPABASE_URL,
    storageBucket: env.SUPABASE_STORAGE_BUCKET,
  }),
);

router.get(
  '/dashboard',
  authenticate,
  validate(dashboardSchema),
  dashboardController.overview,
);

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
