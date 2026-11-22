import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { UsageController } from './usage.controller.js';

interface Dependencies {
  controller: UsageController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createUsageRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('CUSTOMER_READ'));
  router.get('/top', controller.top);
  router.get('/customers/:customerId', controller.forCustomer);
  return router;
}
