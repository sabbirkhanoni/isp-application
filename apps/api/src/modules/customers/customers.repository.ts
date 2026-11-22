import type { ListCustomersQuery, UpdateCustomerInput } from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import { ValidationError } from '../../shared/errors/app-error.js';
import type { PppoeCredentials } from '../network/pppoe-credentials.js';
import { enqueueNetworkSync } from '../network/network-queue.js';
import { createCustomerWithSubscription, type NewCustomerRecord } from './customer-record.js';
import type { CustomerWithSubscription } from './customers.mapper.js';

const WITH_SUBSCRIPTION = {
  subscription: { include: { package: true, router: true } },
  invoices: {
    orderBy: { period: 'desc' as const },
    take: 1,
    select: { period: true, dueDate: true },
  },
} as const;

export interface CustomerRepository {
  findById(id: string): Promise<CustomerWithSubscription | null>;
  list(query: ListCustomersQuery): Promise<{ items: CustomerWithSubscription[]; total: number }>;
  create(input: NewCustomerRecord): Promise<CustomerWithSubscription>;
  update(id: string, input: UpdateCustomerInput): Promise<CustomerWithSubscription>;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(
    private readonly db: Database,
    private readonly credentials: PppoeCredentials,
  ) {}

  findById(id: string): Promise<CustomerWithSubscription | null> {
    return this.db.customer.findUnique({ where: { id }, include: WITH_SUBSCRIPTION });
  }

  async list(query: ListCustomersQuery) {
    const where: Prisma.CustomerWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { customerCode: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { subscription: { pppoeUsername: { contains: query.search, mode: 'insensitive' } } },
              { subscription: { onuSerial: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.customer.findMany({
        where,
        include: WITH_SUBSCRIPTION,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.customer.count({ where }),
    ]);
    return { items, total };
  }

  async create(input: NewCustomerRecord): Promise<CustomerWithSubscription> {
    return this.db.$transaction(async (tx) => {
      const pppoePasswordEnc = this.credentials.forNewCustomer(input);
      const created = await createCustomerWithSubscription(tx, { ...input, pppoePasswordEnc });
      return tx.customer.findUniqueOrThrow({
        where: { id: created.id },
        include: WITH_SUBSCRIPTION,
      });
    });
  }

  update(id: string, input: UpdateCustomerInput): Promise<CustomerWithSubscription> {
    const { routerId, packageId, oltName, ponPort, onuSerial, ...personal } = input;
    return this.db.$transaction(async (tx) => {
      const subscriptionChanges: Prisma.SubscriptionUncheckedUpdateInput = {};
      let needsRouterSync = false;

      if (routerId !== undefined) {
        if (routerId !== null) {
          const router = await tx.router.findUnique({ where: { id: routerId } });
          if (!router?.isActive) {
            throw new ValidationError('Validation failed.', [
              { path: 'routerId', message: 'Choose an active router' },
            ]);
          }
        }
        subscriptionChanges.routerId = routerId;
        needsRouterSync = true; // the new router must learn the customer's current state
      }
      if (packageId !== undefined) {
        const pkg = await tx.package.findUnique({ where: { id: packageId } });
        if (!pkg?.isActive) {
          throw new ValidationError('Validation failed.', [
            { path: 'packageId', message: 'Choose an active package' },
          ]);
        }
        subscriptionChanges.packageId = packageId;
        needsRouterSync = true; // the router profile (speed) follows the package
      }
      if (oltName !== undefined) subscriptionChanges.oltName = oltName;
      if (ponPort !== undefined) subscriptionChanges.ponPort = ponPort;
      if (onuSerial !== undefined) subscriptionChanges.onuSerial = onuSerial;

      if (Object.keys(subscriptionChanges).length > 0) {
        await tx.subscription.update({ where: { customerId: id }, data: subscriptionChanges });
      }
      if (needsRouterSync) await enqueueNetworkSync(tx, id);
      return tx.customer.update({ where: { id }, data: personal, include: WITH_SUBSCRIPTION });
    });
  }
}
