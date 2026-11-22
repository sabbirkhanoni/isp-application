import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { BillingController } from './billing.controller.js';

interface Dependencies {
  controller: BillingController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createInvoicesRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('INVOICE_READ'), controller.listInvoices);
  router.post('/generate', authorize('BILLING_RUN'), controller.generate);
  router.get('/:id', authorize('INVOICE_READ'), controller.invoiceDetail);
  return router;
}

/** GET /customers/:id/billing — mounted next to the customers routes. */
export function createCustomerBillingRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.get('/:id/billing', authenticate, authorize('INVOICE_READ'), controller.customerBilling);
  return router;
}

/** Business details for receipts (everyone signed in) and the billing switches (admin only). */
export function createBillingSettingsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', controller.getSettings);
  router.put('/', authorize('SYSTEM_SETTINGS_WRITE'), controller.saveSettings);
  return router;
}
