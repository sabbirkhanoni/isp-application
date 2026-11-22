import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { AuditController } from './audit.controller.js';

interface Dependencies {
  controller: AuditController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createAuditRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('AUDIT_READ'));
  router.get('/', controller.list);
  return router;
}
