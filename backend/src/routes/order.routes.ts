import { Router } from 'express';
import * as controller from '../controllers/order.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { checkoutSchema, listOrdersSchema, orderIdSchema } from '../validators/order.validator';

const router = Router();

router.use(authenticate);

/** Checkout: turns the caller's active cart into a completed order. */
router.post('/checkout', validate(checkoutSchema), controller.checkout);

router.get('/', validate(listOrdersSchema), controller.list);
router.get('/:id', validate(orderIdSchema), controller.getById);

export default router;
