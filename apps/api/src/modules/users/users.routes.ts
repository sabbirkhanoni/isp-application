import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { UsersController } from './users.controller.js';

interface Dependencies {
  controller: UsersController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createUsersRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('USER_MANAGE'));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.post('/:id/reset-password', controller.resetPassword);
  return router;
}
