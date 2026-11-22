import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { SmsTemplatesController } from './sms-templates.controller.js';

interface Dependencies {
  controller: SmsTemplatesController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createSmsTemplatesRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('SYSTEM_SETTINGS_WRITE'));
  router.get('/', controller.list);
  router.put('/:type', controller.update);
  router.delete('/:type', controller.reset);
  return router;
}
