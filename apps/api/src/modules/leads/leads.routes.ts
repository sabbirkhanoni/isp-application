import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { LeadsController } from './leads.controller.js';

interface Dependencies {
  controller: LeadsController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createLeadsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.post('/', authorize('LEAD_CREATE'), controller.create);
  router.get('/', authorize('LEAD_CREATE'), controller.list);
  router.post('/:id/approve', authorize('LEAD_APPROVE'), controller.approve);
  router.post('/:id/reject', authorize('LEAD_APPROVE'), controller.reject);
  return router;
}
