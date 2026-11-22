import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { SearchController } from './search.controller.js';

interface Dependencies {
  controller: SearchController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createSearchRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.get('/', authenticate, authorize('CUSTOMER_READ'), controller.search);
  return router;
}
