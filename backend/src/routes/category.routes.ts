import { Router } from 'express';
import * as controller from '../controllers/category.controller';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  categoryIdSchema,
  createCategorySchema,
  listCategoriesSchema,
  updateCategorySchema,
} from '../validators/category.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(listCategoriesSchema), controller.list);
router.get('/:id', validate(categoryIdSchema), controller.getById);

router.post('/', requireAdmin, validate(createCategorySchema), controller.create);
router.patch('/:id', requireAdmin, validate(updateCategorySchema), controller.update);
router.delete('/:id', requireAdmin, validate(categoryIdSchema), controller.remove);

export default router;
