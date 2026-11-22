import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { CollectorsController } from './collectors.controller.js';

interface Dependencies {
  controller: CollectorsController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createCollectorsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/overview', authorize('FINANCE_REPORT_READ'), controller.overview);
  router.get('/mine', authorize('INVOICE_READ'), controller.mine);
  router.put('/targets', authorize('USER_MANAGE'), controller.setTarget);
  router.post('/assign', authorize('USER_MANAGE'), controller.assign);
  return router;
}
