import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { SystemController } from './system.controller.js';

interface Dependencies {
  controller: SystemController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createSystemRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('SYSTEM_SETTINGS_WRITE'));
  router.get('/check', controller.check);
  router.get('/data-quality', controller.dataQuality);
  router.get('/export/:name', controller.exportCsv);
  return router;
}
