import { Router } from 'express';
import * as controller from '../controllers/cart.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  addCartItemSchema,
  cartItemIdSchema,
  updateCartItemSchema,
} from '../validators/cart.validator';

const router = Router();

// A cart always belongs to the caller, so there is no cart id in the path —
// the active cart is derived from the authenticated user.
router.use(authenticate);

router.get('/', controller.getActive);
router.post('/items', validate(addCartItemSchema), controller.addItem);
router.patch('/items/:itemId', validate(updateCartItemSchema), controller.updateItem);
router.delete('/items/:itemId', validate(cartItemIdSchema), controller.removeItem);
router.delete('/', controller.clear);

export default router;
