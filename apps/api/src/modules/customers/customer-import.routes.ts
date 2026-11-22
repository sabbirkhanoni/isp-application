import express, { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { CustomerImportController } from './customer-import.controller.js';

interface Dependencies {
  controller: CustomerImportController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createCustomerImportRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('CUSTOMER_IMPORT'));
  // A customer sheet is larger than a normal body; it is read only after the admin is verified.
  router.post('/', express.json({ limit: '3mb' }), controller.run);
  return router;
}
