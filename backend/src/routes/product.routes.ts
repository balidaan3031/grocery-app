import { Router } from 'express';
import * as controller from '../controllers/product.controller';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  barcodeParamSchema,
  createProductSchema,
  deleteProductSchema,
  listProductsSchema,
  productIdSchema,
  updateProductSchema,
} from '../validators/product.validator';

const router = Router();

router.use(authenticate);

// Barcode lookup is declared before `/:id` so a scanned code is never parsed
// as a uuid path segment.
router.get('/barcode/:barcode', validate(barcodeParamSchema), controller.getByBarcode);

router.get('/', validate(listProductsSchema), controller.list);
router.get('/:id', validate(productIdSchema), controller.getById);
router.get('/:id/movements', validate(productIdSchema), controller.movements);

// Catalogue changes are admin-only; staff read the catalogue and sell from it.
router.post('/', requireAdmin, validate(createProductSchema), controller.create);
router.patch('/:id', requireAdmin, validate(updateProductSchema), controller.update);
router.post('/:id/restore', requireAdmin, validate(productIdSchema), controller.restore);
router.delete('/:id', requireAdmin, validate(deleteProductSchema), controller.remove);

export default router;
