import type { CustomerDto } from '@isp/contracts';
import type { Customer, Package, Router, Subscription } from '../../generated/prisma/client.js';

export type CustomerWithSubscription = Customer & {
  subscription: (Subscription & { package: Package; router: Router | null }) | null;
  invoices?: Array<{ period: Date; dueDate: Date }> | null;
  online?: boolean | null;
};

export function toCustomerDto(customer: CustomerWithSubscription): CustomerDto {
  const sub = customer.subscription;
  const latestInvoice = customer.invoices?.[0];
  const formatDateOnly = (d: Date | string | null | undefined): string => {
    if (!d) return '';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toISOString().slice(0, 10);
  };

  const billingPeriod = latestInvoice
    ? {
        startDate: formatDateOnly(latestInvoice.period),
        expiryDate: formatDateOnly(latestInvoice.dueDate),
      }
    : customer.joinedOn
      ? {
          startDate: formatDateOnly(customer.joinedOn),
          expiryDate: formatDateOnly(customer.joinedOn),
        }
      : {
          startDate: formatDateOnly(customer.createdAt),
          expiryDate: formatDateOnly(customer.createdAt),
        };

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
    billingPeriod,
    online: customer.online ?? null,
    createdAt: customer.createdAt.toISOString(),
  };
}
