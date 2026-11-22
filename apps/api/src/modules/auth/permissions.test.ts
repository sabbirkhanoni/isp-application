import {
  GRANTABLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasPermission,
} from '@isp/contracts';
import { describe, expect, it } from 'vitest';

describe('role permissions', () => {
  it('gives ADMIN every permission', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(PERMISSIONS);
  });

  it('never gives STAFF administrative or financial-control permissions', () => {
    const forbidden = [
      'LEAD_APPROVE',
      'LEAD_REVIEW',
      'PAYMENT_REVERSE',
      'FINANCE_REPORT_READ',
      'ROUTER_CONFIG_WRITE',
      'SYSTEM_SETTINGS_WRITE',
      'USER_MANAGE',
      'AUDIT_READ',
      'CUSTOMER_CREATE_ACTIVE',
      'PACKAGE_WRITE',
    ] as const;
    for (const permission of forbidden) expect(hasPermission('STAFF', permission)).toBe(false);
  });
});

describe('extra staff permissions', () => {
  it('adds only grantable rights, ignores unknown or admin-only ones', () => {
    const result = effectivePermissions('STAFF', ['BILLING_RUN', 'USER_MANAGE', 'nonsense']);
    expect(result).toContain('BILLING_RUN');
    expect(result).not.toContain('USER_MANAGE');
    expect(effectivePermissions('STAFF', [])).toEqual(ROLE_PERMISSIONS.STAFF);
  });

  it('never offers the sensitive rights for granting', () => {
    for (const p of [
      'USER_MANAGE',
      'EXPENSE_MANAGE',
      'ROUTER_CONFIG_WRITE',
      'SYSTEM_SETTINGS_WRITE',
      'AUDIT_READ',
      'PAYMENT_REVERSE',
      'LEAD_APPROVE',
      'PACKAGE_WRITE',
    ]) {
      expect(GRANTABLE_PERMISSIONS).not.toContain(p);
    }
  });
});
