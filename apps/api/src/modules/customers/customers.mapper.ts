import type { CustomerDto } from '@isp/contracts';
import type { Customer, Package, Router, Subscription } from '../../generated/prisma/client.js';

export type CustomerWithSubscription = Customer & {
  subscription: (Subscription & { package: Package; router: Router | null }) | null;
};

export function toCustomerDto(customer: CustomerWithSubscription): CustomerDto {
  const sub = customer.subscription;
  return {
    id: customer.id,
    customerCode: customer.customerCode,
    fullName: customer.fullName,
    phone: customer.phone,
    altPhone: customer.altPhone,
    address: customer.address,
    area: customer.area,
    note: customer.note,
    smsOptOut: customer.smsOptOut,
    isFree: customer.isFree,
    status: customer.status,
    suspendReason: customer.suspendReason,
    subscription: sub && {
      packageId: sub.packageId,
      packageName: sub.package.name,
      monthlyPricePoisha: Number(sub.package.monthlyPricePoisha),
      connectionType: sub.connectionType,
      pppoeUsername: sub.pppoeUsername,
      activationPolicy: sub.activationPolicy,
      routerId: sub.routerId,
      routerName: sub.router?.name ?? null,
      hasPppoePassword: sub.pppoePasswordEnc !== null,
      oltName: sub.oltName,
      ponPort: sub.ponPort,
      onuSerial: sub.onuSerial,
    },
    createdAt: customer.createdAt.toISOString(),
  };
}
