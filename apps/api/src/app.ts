import cookieParser from 'cookie-parser';
import express, { Router, type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env.js';
import type { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { HealthController } from './modules/health/health.controller.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import type { BkashController } from './modules/bkash/bkash.controller.js';
import type { BroadcastController } from './modules/notifications/broadcast.controller.js';
import { createBroadcastRouter } from './modules/notifications/broadcast.routes.js';
import { createBkashHookRouter, createBkashRouter } from './modules/bkash/bkash.routes.js';
import type { BillingController } from './modules/billing/billing.controller.js';
import {
  createCustomerBillingRouter,
  createBillingSettingsRouter,
  createInvoicesRouter,
} from './modules/billing/billing.routes.js';
import type { NetworkController } from './modules/network/network.controller.js';
import {
  createAgentRouter,
  createLinesRouter,
  createNetworkJobsRouter,
  createRoutersRouter,
} from './modules/network/network.routes.js';
import type { RouterService } from './modules/network/routers.service.js';
import type { ExpensesController } from './modules/expenses/expenses.controller.js';
import { createExpensesRouter } from './modules/expenses/expenses.routes.js';
import type { ReportsController } from './modules/reports/reports.controller.js';
import type { CollectorsController } from './modules/collectors/collectors.controller.js';
import { createCollectorsRouter } from './modules/collectors/collectors.routes.js';
import type { UsageController } from './modules/usage/usage.controller.js';
import type { OltController } from './modules/olt/olt.controller.js';
import { createFiberRouter, createOltRouter } from './modules/olt/olt.routes.js';
import type { SearchController } from './modules/search/search.controller.js';
import { createSearchRouter } from './modules/search/search.routes.js';
import { createUsageRouter } from './modules/usage/usage.routes.js';
import { createReportsRouter } from './modules/reports/reports.routes.js';
import type { PaymentsController } from './modules/payments/payments.controller.js';
import { createPaymentsRouter } from './modules/payments/payments.routes.js';
import type { CustomerImportController } from './modules/customers/customer-import.controller.js';
import { createCustomerImportRouter } from './modules/customers/customer-import.routes.js';
import type { CustomersController } from './modules/customers/customers.controller.js';
import { createCustomersRouter } from './modules/customers/customers.routes.js';
import type { LeadsController } from './modules/leads/leads.controller.js';
import { createLeadsRouter } from './modules/leads/leads.routes.js';
import type { PackagesController } from './modules/packages/packages.controller.js';
import { createPackagesRouter } from './modules/packages/packages.routes.js';
import type { UsersController } from './modules/users/users.controller.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import type { AuditController } from './modules/audit/audit.controller.js';
import { createSmsTemplatesRouter } from './modules/notifications/sms-templates.routes.js';
import type { SmsTemplatesController } from './modules/notifications/sms-templates.controller.js';
import { createAdjustmentsRouter } from './modules/adjustments/adjustments.routes.js';
import type { AdjustmentsController } from './modules/adjustments/adjustments.controller.js';
import { createSystemRouter } from './modules/system/system.routes.js';
import type { SystemController } from './modules/system/system.controller.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import type { Logger } from './shared/logger/logger.js';
import type { AuthorizeFactory } from './shared/middleware/authorize.js';
import { createErrorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { createTrustedClientIp } from './shared/middleware/client-ip.js';
import { createOriginGuard } from './shared/middleware/origin-guard.js';
import { createRateLimiter } from './shared/middleware/rate-limit.js';
import { requestId } from './shared/middleware/request-id.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
  routerService: RouterService;
  controllers: {
    auth: AuthController;
    users: UsersController;
    packages: PackagesController;
    customers: CustomersController;
    customerImport: CustomerImportController;
    leads: LeadsController;
    payments: PaymentsController;
    billing: BillingController;
    bkash: BkashController;
    broadcast: BroadcastController;
    network: NetworkController;
    reports: ReportsController;
    usage: UsageController;
    search: SearchController;
    olt: OltController;
    collectors: CollectorsController;
    expenses: ExpensesController;
    audit: AuditController;
    system: SystemController;
    adjustments: AdjustmentsController;
    smsTemplates: SmsTemplatesController;
    health: HealthController;
  };
}

export function createApp(deps: AppDependencies): Express {
  const { config, logger, controllers, authenticate, authorize } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);

  app.use(requestId);
  app.use(createTrustedClientIp(config.proxySecret));
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).requestId }));
  app.use(helmet());
  // Large uploads (bKash statements) are parsed by their own route after login; everything else is small.
  app.use((req, res, next) =>
    req.path === '/api/v1/bkash/imports' || req.path === '/api/v1/customers/import'
      ? next()
      : express.json({ limit: '100kb' })(req, res, next),
  );
  app.use(cookieParser());

  app.use('/health', createHealthRouter(controllers.health));

  // The router agent authenticates with its own bearer token and sends no browser Origin header,
  // so it is mounted before the browser-oriented origin guard.
  app.use(
    '/api/v1/agent',
    createAgentRouter({
      controller: controllers.network,
      routers: deps.routerService,
      rateLimiter: createRateLimiter({ windowMs: 60_000, limit: 120 }),
    }),
  );

  // The phone's SMS forwarder (no browser Origin) authenticates with its own secret token.
  app.use(
    '/api/v1/hooks',
    createBkashHookRouter(controllers.bkash, createRateLimiter({ windowMs: 60_000, limit: 60 })),
  );

  const api = Router();
  api.use(createRateLimiter({ windowMs: 60_000, limit: 300 }));
  api.use(createOriginGuard(config.allowedOrigins));
  api.use(
    '/auth',
    createAuthRouter({
      controller: controllers.auth,
      authenticate,
      loginRateLimiter: createRateLimiter({
        windowMs: 15 * 60_000,
        limit: config.loginRateLimitPer15Min,
      }),
    }),
  );
  api.use(
    '/admin/users',
    createUsersRouter({ controller: controllers.users, authenticate, authorize }),
  );
  const guarded = { authenticate, authorize };
  api.use('/packages', createPackagesRouter({ controller: controllers.packages, ...guarded }));
  api.use(
    '/customers',
    createCustomerBillingRouter({ controller: controllers.billing, ...guarded }),
  );
  api.use('/invoices', createInvoicesRouter({ controller: controllers.billing, ...guarded }));
  api.use(
    '/billing-settings',
    createBillingSettingsRouter({ controller: controllers.billing, ...guarded }),
  );
  api.use(
    '/adjustments',
    createAdjustmentsRouter({ controller: controllers.adjustments, ...guarded }),
  );
  api.use('/system', createSystemRouter({ controller: controllers.system, ...guarded }));
  api.use('/audit-logs', createAuditRouter({ controller: controllers.audit, ...guarded }));
  api.use(
    '/sms-templates',
    createSmsTemplatesRouter({ controller: controllers.smsTemplates, ...guarded }),
  );
  api.use('/expenses', createExpensesRouter({ controller: controllers.expenses, ...guarded }));
  api.use('/olts', createOltRouter({ controller: controllers.olt, ...guarded }));
  api.use('/fiber', createFiberRouter({ controller: controllers.olt, ...guarded }));
  api.use('/search', createSearchRouter({ controller: controllers.search, ...guarded }));
  api.use('/usage', createUsageRouter({ controller: controllers.usage, ...guarded }));
  api.use(
    '/collectors',
    createCollectorsRouter({ controller: controllers.collectors, ...guarded }),
  );
  api.use('/reports', createReportsRouter({ controller: controllers.reports, ...guarded }));
  api.use(
    '/sms-broadcast',
    createBroadcastRouter({ controller: controllers.broadcast, ...guarded }),
  );
  api.use('/bkash', createBkashRouter({ controller: controllers.bkash, ...guarded }));
  api.use('/network/lines', createLinesRouter({ controller: controllers.network, ...guarded }));
  api.use('/routers', createRoutersRouter({ controller: controllers.network, ...guarded }));
  api.use(
    '/network-jobs',
    createNetworkJobsRouter({ controller: controllers.network, ...guarded }),
  );
  api.use('/payments', createPaymentsRouter({ controller: controllers.payments, ...guarded }));
  api.use(
    '/customers/import',
    createCustomerImportRouter({ controller: controllers.customerImport, ...guarded }),
  );
  api.use('/customers', createCustomersRouter({ controller: controllers.customers, ...guarded }));
  api.use('/leads', createLeadsRouter({ controller: controllers.leads, ...guarded }));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
