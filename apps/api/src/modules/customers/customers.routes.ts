import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { CustomersController } from './customers.controller.js';

interface Dependencies {
  controller: CustomersController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createCustomersRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('CUSTOMER_READ'), controller.list);
  router.post('/', authorize('CUSTOMER_CREATE_ACTIVE'), controller.create);
  router.get('/:id', authorize('CUSTOMER_READ'), controller.get);
  router.patch('/:id', authorize('CUSTOMER_UPDATE'), controller.update);
  router.post('/:id/suspend', authorize('CUSTOMER_SUSPEND'), controller.suspend);
  router.post('/:id/terminate', authorize('CUSTOMER_SUSPEND'), controller.terminate);
  router.post('/:id/activate', authorize('CUSTOMER_SUSPEND'), controller.activate);
  return router;
}
