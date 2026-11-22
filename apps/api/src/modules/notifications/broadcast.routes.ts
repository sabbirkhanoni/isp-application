import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { BroadcastController } from './broadcast.controller.js';

interface Dependencies {
  controller: BroadcastController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createBroadcastRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('SMS_BROADCAST'));
  router.post('/preview', controller.preview);
  router.post('/', controller.send);
  return router;
}
