import type { ApproveLeadInput, CreateLeadInput, ListLeadsQuery } from '@isp/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../shared/database/prisma-client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { createCustomerWithSubscription } from '../customers/customer-record.js';
import { dhakaToday } from '../../shared/utils/dhaka-time.js';
import type { PppoeCredentials } from '../network/pppoe-credentials.js';
import type { CustomerWithSubscription } from '../customers/customers.mapper.js';
import type { LeadWithRelations } from './leads.mapper.js';

const WITH_RELATIONS = {
  requestedPackage: true,
  creator: { select: { fullName: true } },
} as const;

export interface LeadFilter {
  status?: ListLeadsQuery['status'];
  /** Restricts the list to one creator (staff see only their own leads). */
  createdBy?: string;
}

export interface ApprovalResult {
  lead: LeadWithRelations;
  customer: CustomerWithSubscription;
}

export interface LeadRepository {
  create(input: CreateLeadInput, createdBy: string): Promise<LeadWithRelations>;
  list(
    filter: LeadFilter,
    page: number,
    limit: number,
  ): Promise<{ items: LeadWithRelations[]; total: number }>;
  approve(
    leadId: string,
    reviewerId: string,
    input: ApproveLeadInput,
    now: Date,
  ): Promise<ApprovalResult>;
  reject(leadId: string, reviewerId: string, reason: string, now: Date): Promise<LeadWithRelations>;
}

export class PrismaLeadRepository implements LeadRepository {
  constructor(
    private readonly db: Database,
    private readonly credentials: PppoeCredentials,
  ) {}

  async create(input: CreateLeadInput, createdBy: string): Promise<LeadWithRelations> {
    if (input.requestedPackageId) {
      const pkg = await this.db.package.findUnique({ where: { id: input.requestedPackageId } });
      if (!pkg) {
        throw new ValidationError('Validation failed.', [
          { path: 'requestedPackageId', message: 'Package not found' },
        ]);
      }
    }
    return this.db.lead.create({
      data: {
        fullName: input.fullName,
        phone: input.phone,
        address: input.address,
        area: input.area ?? null,
        requestedPackageId: input.requestedPackageId ?? null,
        connectionType: input.connectionType,
        note: input.note ?? null,
        createdBy,
      },
      include: WITH_RELATIONS,
    });
  }

  async list(filter: LeadFilter, page: number, limit: number) {
    const where: Prisma.LeadWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.createdBy ? { createdBy: filter.createdBy } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.lead.findMany({
        where,
        include: WITH_RELATIONS,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.lead.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Claim the lead, create the customer and link them in ONE transaction:
   * if anything fails (duplicate ID, inactive package) the lead stays PENDING.
   */
  approve(
    leadId: string,
    reviewerId: string,
    input: ApproveLeadInput,
    now: Date,
  ): Promise<ApprovalResult> {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new NotFoundError('Lead not found.');

      // Conditional update = row lock + guard against two admins approving at once.
      const claimed = await tx.lead.updateMany({
        where: { id: leadId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: now },
      });
      if (claimed.count === 0) throw new ConflictError('This lead has already been reviewed.');

      const customer = await createCustomerWithSubscription(tx, {
        customerCode: input.customerCode,
        fullName: lead.fullName,
        phone: lead.phone,
        address: lead.address,
        area: lead.area ?? undefined,
        note: lead.note ?? undefined,
        packageId: input.packageId,
        connectionType: input.connectionType,
        pppoeUsername: input.pppoeUsername,
        activationPolicy: input.activationPolicy,
        routerId: input.routerId,
        pppoePasswordEnc: this.credentials.forNewCustomer(input),
        createdBy: lead.createdBy,
        joinedOn: dhakaToday(now),
      });
      const linked = await tx.lead.update({
        where: { id: leadId },
        data: { customerId: customer.id },
        include: WITH_RELATIONS,
      });
      const fullCustomer = await tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
        include: { subscription: { include: { package: true, router: true } } },
      });
      return { lead: linked, customer: fullCustomer };
    });
  }

  async reject(
    leadId: string,
    reviewerId: string,
    reason: string,
    now: Date,
  ): Promise<LeadWithRelations> {
    const claimed = await this.db.lead.updateMany({
      where: { id: leadId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: now, rejectReason: reason },
    });
    if (claimed.count === 0) {
      const exists = await this.db.lead.findUnique({ where: { id: leadId }, select: { id: true } });
      if (!exists) throw new NotFoundError('Lead not found.');
      throw new ConflictError('This lead has already been reviewed.');
    }
    return this.db.lead.findUniqueOrThrow({ where: { id: leadId }, include: WITH_RELATIONS });
  }
}
