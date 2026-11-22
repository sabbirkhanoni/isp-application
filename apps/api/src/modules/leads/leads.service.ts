import type {
  ApproveLeadInput,
  CreateLeadInput,
  CustomerDto,
  LeadDto,
  ListLeadsQuery,
  PaginationMeta,
  RejectLeadInput,
} from '@isp/contracts';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toCustomerDto } from '../customers/customers.mapper.js';
import { toLeadDto } from './leads.mapper.js';
import type { LeadRepository } from './leads.repository.js';

export class LeadService {
  constructor(
    private readonly leads: LeadRepository,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async create(actor: AuthContext, input: CreateLeadInput, ctx: RequestContext): Promise<LeadDto> {
    const lead = await this.leads.create(input, actor.userId);
    await this.record(actor, AUDIT_ACTIONS.LEAD_CREATED, lead.id, ctx, {
      connectionType: lead.connectionType,
    });
    return toLeadDto(lead);
  }

  /** Admins (LEAD_REVIEW) see every lead; staff see only the leads they submitted. */
  async list(
    actor: AuthContext,
    query: ListLeadsQuery,
  ): Promise<{ items: LeadDto[]; pagination: PaginationMeta }> {
    const canReviewAll = actor.permissions.includes('LEAD_REVIEW');
    const { items, total } = await this.leads.list(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(canReviewAll ? {} : { createdBy: actor.userId }),
      },
      query.page,
      query.limit,
    );
    return {
      items: items.map(toLeadDto),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async approve(
    actor: AuthContext,
    leadId: string,
    input: ApproveLeadInput,
    ctx: RequestContext,
  ): Promise<{ lead: LeadDto; customer: CustomerDto }> {
    const { lead, customer } = await this.leads.approve(
      leadId,
      actor.userId,
      input,
      this.clock.now(),
    );
    await this.record(actor, AUDIT_ACTIONS.LEAD_APPROVED, leadId, ctx, {
      customerId: customer.id,
      customerCode: customer.customerCode,
      activationPolicy: input.activationPolicy,
      connectionType: input.connectionType,
    });
    return { lead: toLeadDto(lead), customer: toCustomerDto(customer) };
  }

  async reject(
    actor: AuthContext,
    leadId: string,
    input: RejectLeadInput,
    ctx: RequestContext,
  ): Promise<LeadDto> {
    const lead = await this.leads.reject(leadId, actor.userId, input.reason, this.clock.now());
    await this.record(actor, AUDIT_ACTIONS.LEAD_REJECTED, leadId, ctx, {});
    return toLeadDto(lead);
  }

  private record(
    actor: AuthContext,
    action: (typeof AUDIT_ACTIONS)['LEAD_CREATED' | 'LEAD_APPROVED' | 'LEAD_REJECTED'],
    leadId: string,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'lead',
      targetId: leadId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}
