import type { Role } from './enums.js';

export const PERMISSIONS = [
  'CUSTOMER_READ',
  'CUSTOMER_CREATE_ACTIVE',
  'PACKAGE_READ',
  'PACKAGE_WRITE',
  'CUSTOMER_UPDATE',
  'LEAD_CREATE',
  'LEAD_REVIEW',
  'LEAD_APPROVE',
  'CASH_COLLECTION_CREATE',
  'PAYMENT_RECORD_BKASH',
  'INVOICE_READ',
  'BILLING_RUN',
  'PAYMENT_REVERSE',
  'BILLING_ADJUST',
  'BKASH_RECONCILE',
  'CUSTOMER_SUSPEND',
  'CUSTOMER_IMPORT',
  'FINANCE_REPORT_READ',
  'SMS_BROADCAST',
  'EXPENSE_MANAGE',
  'ROUTER_CONFIG_WRITE',
  'NETWORK_DIAGNOSTIC_READ',
  'SYSTEM_SETTINGS_WRITE',
  'TICKET_UPDATE',
  'USER_MANAGE',
  'AUDIT_READ',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'CUSTOMER_READ',
  'PACKAGE_READ',
  'LEAD_CREATE',
  'CASH_COLLECTION_CREATE',
  'INVOICE_READ',
  'NETWORK_DIAGNOSTIC_READ',
  'TICKET_UPDATE',
];

/** Single source of truth for authorization. Backend enforces it; the frontend only mirrors it for UX. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Extra rights an admin may hand to one staff member on top of the STAFF role.
 * Deliberately excludes user management, expenses, router/system settings, audit log,
 * payment reversal, lead approval and package pricing: those stay admin-only.
 */
export const GRANTABLE_PERMISSIONS = [
  'CUSTOMER_CREATE_ACTIVE',
  'CUSTOMER_UPDATE',
  'LEAD_REVIEW',
  'PAYMENT_RECORD_BKASH',
  'BILLING_RUN',
  'BILLING_ADJUST',
  'BKASH_RECONCILE',
  'CUSTOMER_SUSPEND',
  'CUSTOMER_IMPORT',
  'FINANCE_REPORT_READ',
] as const satisfies readonly Permission[];

export type GrantablePermission = (typeof GRANTABLE_PERMISSIONS)[number];

/** Role rights plus any extra grants (admins already hold everything; unknown values are ignored). */
export function effectivePermissions(role: Role, extra: readonly string[]): readonly Permission[] {
  if (role === 'ADMIN') return PERMISSIONS;
  const granted = GRANTABLE_PERMISSIONS.filter((p) => extra.includes(p));
  return [...new Set<Permission>([...ROLE_PERMISSIONS[role], ...granted])];
}
