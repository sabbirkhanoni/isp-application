import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { ExpensesController } from './expenses.controller.js';

interface Dependencies {
  controller: ExpensesController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createExpensesRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('EXPENSE_MANAGE'));
  router.get('/', controller.list);
  router.get('/export.csv', controller.csv);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
