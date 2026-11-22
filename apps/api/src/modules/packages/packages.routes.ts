import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { PackagesController } from './packages.controller.js';

interface Dependencies {
  controller: PackagesController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createPackagesRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('PACKAGE_READ'), controller.list);
  router.post('/', authorize('PACKAGE_WRITE'), controller.create);
  router.patch('/:id', authorize('PACKAGE_WRITE'), controller.update);
  return router;
}
