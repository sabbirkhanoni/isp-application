import type { Clock } from '../../shared/utils/clock.js';
import { dhakaToday } from '../../shared/utils/dhaka-time.js';
import type {
  CreateCustomerInput,
  CustomerDto,
  ListCustomersQuery,
  PaginationMeta,
  UpdateCustomerInput,
} from '@isp/contracts';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toCustomerDto } from './customers.mapper.js';
import type { CustomerRepository } from './customers.repository.js';

export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async list(
    query: ListCustomersQuery,
  ): Promise<{ items: CustomerDto[]; pagination: PaginationMeta }> {
    const { items, total } = await this.customers.list(query);
    return {
      items: items.map(toCustomerDto),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async getById(id: string): Promise<CustomerDto> {
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundError('Customer not found.');
    return toCustomerDto(customer);
  }

  async create(
    actor: AuthContext,
    input: CreateCustomerInput,
    ctx: RequestContext,
  ): Promise<CustomerDto> {
    const customer = await this.customers.create({
      ...input,
      createdBy: actor.userId,
      joinedOn: dhakaToday(this.clock.now()),
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_CREATED,
      targetType: 'customer',
      targetId: customer.id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: {
        customerCode: customer.customerCode,
        activationPolicy: input.activationPolicy,
        source: 'direct',
      },
    });
    return toCustomerDto(customer);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateCustomerInput,
    ctx: RequestContext,
  ): Promise<CustomerDto> {
    if (!(await this.customers.findById(id))) throw new NotFoundError('Customer not found.');
    if (input.isFree !== undefined && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only an admin can change a free line.');
    }
    const updated = await this.customers.update(id, input);
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
      targetType: 'customer',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata: { changedFields: Object.keys(input) },
    });
    return toCustomerDto(updated);
  }
}
