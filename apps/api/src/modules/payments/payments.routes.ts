import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { PaymentsController } from './payments.controller.js';

interface Dependencies {
  controller: PaymentsController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createPaymentsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.post('/', authorize('CASH_COLLECTION_CREATE'), controller.record);
  router.get('/', authorize('FINANCE_REPORT_READ'), controller.list);
  router.get('/:id', authorize('INVOICE_READ'), controller.receipt);
  router.post('/:id/move', authorize('PAYMENT_REVERSE'), controller.move);
  router.post('/:id/reverse', authorize('PAYMENT_REVERSE'), controller.reverse);
  return router;
}
