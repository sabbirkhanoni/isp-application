import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { OltController } from './olt.controller.js';

interface Dependencies {
  controller: OltController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createOltRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('ROUTER_CONFIG_WRITE'), controller.list);
  router.post('/', authorize('ROUTER_CONFIG_WRITE'), controller.create);
  router.patch('/:id', authorize('ROUTER_CONFIG_WRITE'), controller.update);
  router.post('/:id/test', authorize('ROUTER_CONFIG_WRITE'), controller.test);
  router.post('/:id/poll', authorize('ROUTER_CONFIG_WRITE'), controller.poll);
  return router;
}

/** Fiber signal list for support staff: "is this customer's fiber weak?" */
export function createFiberRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('CUSTOMER_READ'), controller.listFiber);
  router.get('/customer/:id', authorize('CUSTOMER_READ'), controller.fiberOfCustomer);
  return router;
}
