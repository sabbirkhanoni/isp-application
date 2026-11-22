import type { LeadDto } from '@isp/contracts';
import type { Lead, Package, User } from '../../generated/prisma/client.js';

export type LeadWithRelations = Lead & {
  requestedPackage: Package | null;
  creator: Pick<User, 'fullName'>;
};

export function toLeadDto(lead: LeadWithRelations): LeadDto {
  return {
    id: lead.id,
    fullName: lead.fullName,
    phone: lead.phone,
    address: lead.address,
    area: lead.area,
    requestedPackageId: lead.requestedPackageId,
    requestedPackageName: lead.requestedPackage?.name ?? null,
    connectionType: lead.connectionType,
    note: lead.note,
    status: lead.status,
    rejectReason: lead.rejectReason,
    customerId: lead.customerId,
    createdByName: lead.creator.fullName,
    createdAt: lead.createdAt.toISOString(),
    reviewedAt: lead.reviewedAt?.toISOString() ?? null,
  };
}
