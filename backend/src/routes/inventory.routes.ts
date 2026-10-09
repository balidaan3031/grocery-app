import { Router } from 'express';
import * as controller from '../controllers/inventory.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  adjustStockSchema,
  countStockSchema,
  listInventorySchema,
  listMovementsSchema,
  lowStockSchema,
  productIdParamSchema,
} from '../validators/inventory.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(listInventorySchema), controller.list);
router.get('/summary', controller.summary);
router.get('/low-stock', validate(lowStockSchema), controller.lowStock);
router.get('/movements', validate(listMovementsSchema), controller.movements);
router.get('/:productId/movements', validate(productIdParamSchema), controller.productMovements);

// Staff may correct stock — they are the ones holding the shelf — but every
// change is attributed to them in the ledger.
router.post('/:productId/adjust', validate(adjustStockSchema), controller.adjust);
router.post('/:productId/count', validate(countStockSchema), controller.count);

export default router;
