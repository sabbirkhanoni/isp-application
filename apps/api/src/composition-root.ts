import type { Express } from 'express';
import { createApp } from './app.js';
import type { AppConfig } from './config/env.js';
import { AuditRepository } from './modules/audit/audit.repository.js';
import { AdjustmentsController } from './modules/adjustments/adjustments.controller.js';
import { AdjustmentsService } from './modules/adjustments/adjustments.service.js';
import { SystemController } from './modules/system/system.controller.js';
import { SystemRepository } from './modules/system/system.repository.js';
import { SystemService } from './modules/system/system.service.js';
import { BillingSettingsStore } from './modules/billing/billing-settings.store.js';
import { AuditController } from './modules/audit/audit.controller.js';
import { SmsTemplateStore } from './modules/notifications/sms-template.store.js';
import { SmsTemplateService } from './modules/notifications/sms-template.service.js';
import { SmsTemplatesController } from './modules/notifications/sms-templates.controller.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { PrismaCredentialRepository } from './modules/auth/credentials.repository.js';
import { Argon2PasswordHasher } from './modules/auth/password-hasher.js';
import { PrismaSessionRepository } from './modules/auth/session.repository.js';
import { CustomersController } from './modules/customers/customers.controller.js';
import { PrismaCustomerRepository } from './modules/customers/customers.repository.js';
import { CustomerService } from './modules/customers/customers.service.js';
import { LeadsController } from './modules/leads/leads.controller.js';
import { PrismaLeadRepository } from './modules/leads/leads.repository.js';
import { LeadService } from './modules/leads/leads.service.js';
import { PackagesController } from './modules/packages/packages.controller.js';
import { PrismaPackageRepository } from './modules/packages/packages.repository.js';
import { PackageService } from './modules/packages/packages.service.js';
import { CollectorsController } from './modules/collectors/collectors.controller.js';
import { CollectorsRepository } from './modules/collectors/collectors.repository.js';
import { CollectorsService } from './modules/collectors/collectors.service.js';
import { UsageController } from './modules/usage/usage.controller.js';
import { UsageRepository } from './modules/usage/usage.repository.js';
import { UsageService } from './modules/usage/usage.service.js';
import { SearchController } from './modules/search/search.controller.js';
import { SearchRepository } from './modules/search/search.repository.js';
import { AlertService } from './modules/alerts/alert.service.js';
import { BroadcastController } from './modules/notifications/broadcast.controller.js';
import { BroadcastService } from './modules/notifications/broadcast.service.js';
import { BkashController } from './modules/bkash/bkash.controller.js';
import { BkashRepository } from './modules/bkash/bkash.repository.js';
import { SmsHookStore } from './modules/bkash/sms-hook.store.js';
import { BkashService } from './modules/bkash/bkash.service.js';
import { BillingController } from './modules/billing/billing.controller.js';
import { BillingRepository } from './modules/billing/billing.repository.js';
import { BillingService } from './modules/billing/billing.service.js';
import { NotificationRepository } from './modules/notifications/notifications.repository.js';
import { NotificationService } from './modules/notifications/notifications.service.js';
import { HttpSmsSender, LogSmsSender, type SmsSender } from './modules/notifications/sms-sender.js';
import { PppoeCredentials } from './modules/network/pppoe-credentials.js';
import { NetworkController } from './modules/network/network.controller.js';
import { NetworkRepository } from './modules/network/network.repository.js';
import { NetworkService } from './modules/network/network.service.js';
import { OltController } from './modules/olt/olt.controller.js';
import { OltRepository } from './modules/olt/olt.repository.js';
import { OltService } from './modules/olt/olt.service.js';
import { NetSnmpClient, type SnmpClient } from './modules/olt/snmp-client.js';
import { LiveToolsService } from './modules/network/live-tools.service.js';
import { RouterOsRestGateway } from './modules/network/routeros-rest-gateway.js';
import { RouterService } from './modules/network/routers.service.js';
import { LogRouterGateway } from './modules/network/router-gateway.js';
import type { RouterGateway } from './modules/network/router-gateway.js';
import { AesSecretBox, MissingSecretBox } from './modules/network/secret-box.js';
import { CustomerImportController } from './modules/customers/customer-import.controller.js';
import { CustomerImportService } from './modules/customers/customer-import.service.js';
import { CustomerStatusService } from './modules/customers/customer-status.service.js';
import { ExpensesController } from './modules/expenses/expenses.controller.js';
import { ExpensesRepository } from './modules/expenses/expenses.repository.js';
import { ExpensesService } from './modules/expenses/expenses.service.js';
import { ReportsController } from './modules/reports/reports.controller.js';
import { ReportsRepository } from './modules/reports/reports.repository.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { PaymentsController } from './modules/payments/payments.controller.js';
import { PaymentRepository } from './modules/payments/payments.repository.js';
import { PaymentService } from './modules/payments/payments.service.js';
import { HealthController } from './modules/health/health.controller.js';
import { UsersController } from './modules/users/users.controller.js';
import { PrismaUserRepository } from './modules/users/users.repository.js';
import { UserService } from './modules/users/users.service.js';
import type { Database } from './shared/database/prisma-client.js';
import type { Logger } from './shared/logger/logger.js';
import { createAuthenticate } from './shared/middleware/authenticate.js';
import { createAuthorize } from './shared/middleware/authorize.js';
import { systemClock, type Clock } from './shared/utils/clock.js';

interface Options {
  config: AppConfig;
  db: Database;
  logger: Logger;
  clock?: Clock;
  /** Override the SMS driver (tests). */
  smsSender?: SmsSender;
  /** Override the router driver (tests). */
  routerGateway?: RouterGateway;
  snmpClient?: SnmpClient;
}

export interface Services {
  app: Express;
  billing: BillingService;
  notifications: NotificationService;
  network: NetworkService;
  customerStatus: CustomerStatusService;
  reports: ReportsService;
  sender: SmsSender;
  ownerPhone: string | null;
  billingSettings: BillingSettingsStore;
  alerts: AlertService;
  usage: UsageService;
  olt: OltService;
}

/**
 * The only place where concrete classes are wired together.
 * Everything else depends on interfaces, which keeps modules testable and replaceable.
 */
export function buildServices({
  config,
  db,
  logger,
  clock = systemClock,
  smsSender,
  routerGateway,
  snmpClient,
}: Options): Services {
  const hasher = new Argon2PasswordHasher();
  const audit = new AuditService(new AuditRepository(db));
  const smsTemplates = new SmsTemplateStore(db);
  const sessions = new PrismaSessionRepository(db);

  const authService = new AuthService(
    new PrismaCredentialRepository(db),
    sessions,
    hasher,
    audit,
    clock,
    {
      sessionTtlHours: config.sessionTtlHours,
      loginMaxFailures: config.loginMaxFailures,
      loginLockMinutes: config.loginLockMinutes,
    },
  );
  const userService = new UserService(new PrismaUserRepository(db), hasher, sessions, audit, clock);

  const packageService = new PackageService(new PrismaPackageRepository(db), audit);
  const secrets = config.network.routerSecret
    ? new AesSecretBox(config.network.routerSecret)
    : new MissingSecretBox();
  const credentials = new PppoeCredentials(secrets);
  const customerRepository = new PrismaCustomerRepository(db, credentials);
  const customerService = new CustomerService(customerRepository, audit, clock);
  const customerStatus = new CustomerStatusService(db, customerRepository, audit, clock);
  const leadService = new LeadService(new PrismaLeadRepository(db, credentials), audit, clock);

  const paymentRepository = new PaymentRepository(db, config.sms.locale, smsTemplates);
  const paymentService = new PaymentService(paymentRepository, audit, clock);
  const bkashService = new BkashService(
    new BkashRepository(db),
    paymentRepository,
    audit,
    clock,
    new SmsHookStore(db),
  );
  const billingSettings = new BillingSettingsStore(db, {
    enabled: config.network.autoSuspend,
    graceDays: config.network.graceDays,
  });
  const billingService = new BillingService(
    new BillingRepository(db),
    billingSettings,
    paymentService,
    audit,
    clock,
    logger,
  );
  const sender =
    smsSender ??
    (config.sms.driver === 'http' && config.sms.apiUrl && config.sms.apiKey
      ? new HttpSmsSender({
          apiUrl: config.sms.apiUrl,
          apiKey: config.sms.apiKey,
          senderId: config.sms.senderId,
        })
      : new LogSmsSender(logger));
  const notificationService = new NotificationService(
    new NotificationRepository(db),
    smsTemplates,
    sender,
    clock,
    logger,
    {
      locale: config.sms.locale,
      monthlyCap: config.sms.monthlyCap,
    },
  );

  const restGateway = new RouterOsRestGateway();
  const gateway =
    routerGateway ??
    (config.network.dryRun ? new LogRouterGateway(logger, restGateway) : restGateway);
  const networkRepository = new NetworkRepository(db);
  const routerService = new RouterService(networkRepository, gateway, secrets, audit, clock);
  const networkService = new NetworkService(
    networkRepository,
    routerService,
    gateway,
    audit,
    clock,
    logger,
    credentials,
  );

  const reportsService = new ReportsService(new ReportsRepository(db), clock);
  const usageService = new UsageService(new UsageRepository(db), clock);
  const collectorsService = new CollectorsService(new CollectorsRepository(db), audit, clock);
  const oltService = new OltService(
    new OltRepository(db),
    snmpClient ?? new NetSnmpClient(),
    secrets,
    audit,
    sender,
    config.ownerPhone,
    clock,
    logger,
  );

  const app = createApp({
    routerService,
    config,
    logger,
    authenticate: createAuthenticate(authService, config.sessionCookieName),
    authorize: createAuthorize(audit),
    controllers: {
      auth: new AuthController(authService, {
        name: config.sessionCookieName,
        secure: config.cookieSecure,
      }),
      users: new UsersController(userService),
      packages: new PackagesController(packageService),
      customers: new CustomersController(customerService, customerStatus),
      customerImport: new CustomerImportController(new CustomerImportService(db, audit, clock)),
      leads: new LeadsController(leadService),
      payments: new PaymentsController(paymentService),
      billing: new BillingController(billingService),
      bkash: new BkashController(bkashService),
      broadcast: new BroadcastController(new BroadcastService(db, audit, clock)),
      network: new NetworkController(
        routerService,
        networkService,
        new LiveToolsService(networkRepository, routerService, gateway, audit),
      ),
      reports: new ReportsController(reportsService),
      usage: new UsageController(usageService),
      search: new SearchController(new SearchRepository(db)),
      olt: new OltController(oltService),
      collectors: new CollectorsController(collectorsService),
      audit: new AuditController(audit),
      adjustments: new AdjustmentsController(new AdjustmentsService(db, audit, clock)),
      system: new SystemController(
        new SystemService(new SystemRepository(db), audit, config, () => clock.now()),
      ),
      smsTemplates: new SmsTemplatesController(
        new SmsTemplateService(smsTemplates, audit, config.sms.locale),
      ),
      expenses: new ExpensesController(new ExpensesService(new ExpensesRepository(db), audit)),
      health: new HealthController(async () => {
        await db.$queryRaw`SELECT 1`;
      }),
    },
  });

  return {
    app,
    billing: billingService,
    notifications: notificationService,
    network: networkService,
    customerStatus,
    reports: reportsService,
    sender,
    ownerPhone: config.ownerPhone,
    billingSettings,
    usage: usageService,
    olt: oltService,
    alerts: new AlertService(db, sender, config.ownerPhone, clock, logger),
  };
}

export function buildApp(options: Options): Express {
  return buildServices(options).app;
}
