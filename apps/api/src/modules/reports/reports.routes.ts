import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { ReportsController } from './reports.controller.js';

interface Dependencies {
  controller: ReportsController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createReportsRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/summary', authorize('FINANCE_REPORT_READ'), controller.summary);
  router.get('/trend', authorize('FINANCE_REPORT_READ'), controller.trend);
  // Collectors need to see who owes money; exporting everything is an admin action.
  router.get('/dues', authorize('INVOICE_READ'), controller.dues);
  router.get('/dues.csv', authorize('FINANCE_REPORT_READ'), controller.duesCsv);
  router.get('/collections.csv', authorize('FINANCE_REPORT_READ'), controller.collectionsCsv);
  router.get('/profit', authorize('FINANCE_REPORT_READ'), controller.profit);
  router.get('/profit.csv', authorize('FINANCE_REPORT_READ'), controller.profitCsv);
  router.get('/collectors', authorize('FINANCE_REPORT_READ'), controller.collectors);
  router.get('/collectors.csv', authorize('FINANCE_REPORT_READ'), controller.collectorsCsv);
  router.get('/areas', authorize('FINANCE_REPORT_READ'), controller.areas);
  router.get('/areas.csv', authorize('FINANCE_REPORT_READ'), controller.areasCsv);
  router.get('/churn', authorize('FINANCE_REPORT_READ'), controller.churn);
  return router;
}
