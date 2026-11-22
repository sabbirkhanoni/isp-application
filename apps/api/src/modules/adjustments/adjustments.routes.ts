import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { AdjustmentsController } from './adjustments.controller.js';

interface Dependencies {
  controller: AdjustmentsController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createAdjustmentsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('BILLING_ADJUST'));
  router.post('/customers/:customerId/charges', controller.addCharge);
  router.put('/customers/:customerId/discount', controller.setDiscount);
  router.delete('/charges/:chargeId', controller.cancelCharge);
  return router;
}
