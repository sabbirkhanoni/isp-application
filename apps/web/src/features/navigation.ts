import type { Permission } from '@isp/contracts';
import type { Dictionary } from '@/i18n/en';

export type NavGroup = 'overview' | 'people' | 'billing' | 'network' | 'finance' | 'settings';

export interface NavItem {
  to: string;
  group: NavGroup;
  label: (t: Dictionary) => string;
  /** Shown only to users holding this permission (undefined = everyone signed in). */
  permission?: Permission;
  end?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', group: 'overview', label: (t) => t.nav.dashboard, end: true },
  { to: '/leads', group: 'people', label: (t) => t.nav.leads, permission: 'LEAD_CREATE' },
  { to: '/customers', group: 'people', label: (t) => t.nav.customers, permission: 'CUSTOMER_READ' },
  {
    to: '/network/lines',
    group: 'network',
    label: (t) => t.nav.lines,
    permission: 'CUSTOMER_READ',
  },
  {
    to: '/billing/invoices',
    group: 'billing',
    label: (t) => t.nav.invoices,
    permission: 'FINANCE_REPORT_READ',
  },
  {
    to: '/billing/payments',
    group: 'billing',
    label: (t) => t.nav.payments,
    permission: 'FINANCE_REPORT_READ',
  },
  { to: '/billing/dues', group: 'billing', label: (t) => t.nav.dues, permission: 'INVOICE_READ' },
  {
    to: '/billing/bkash',
    group: 'billing',
    label: (t) => t.nav.bkash,
    permission: 'BKASH_RECONCILE',
  },
  {
    to: '/finance',
    group: 'finance',
    label: (t) => t.nav.finance,
    permission: 'FINANCE_REPORT_READ',
  },
  {
    to: '/finance/expenses',
    group: 'finance',
    label: (t) => t.nav.expenses,
    permission: 'EXPENSE_MANAGE',
  },
  {
    to: '/admin/routers',
    group: 'network',
    label: (t) => t.nav.routers,
    permission: 'ROUTER_CONFIG_WRITE',
  },
  {
    to: '/admin/packages',
    group: 'settings',
    label: (t) => t.nav.packages,
    permission: 'PACKAGE_WRITE',
  },
  {
    to: '/admin/billing',
    group: 'settings',
    label: (t) => t.nav.billingSettings,
    permission: 'SYSTEM_SETTINGS_WRITE',
  },
  {
    to: '/network/fiber',
    group: 'network',
    label: (t) => t.nav.fiber,
    permission: 'CUSTOMER_READ',
  },
  {
    to: '/admin/olts',
    group: 'network',
    label: (t) => t.nav.olts,
    permission: 'ROUTER_CONFIG_WRITE',
  },
  {
    to: '/network/usage',
    group: 'network',
    label: (t) => t.nav.usage,
    permission: 'CUSTOMER_READ',
  },
  {
    to: '/admin/collectors',
    group: 'people',
    label: (t) => t.nav.collectors,
    permission: 'FINANCE_REPORT_READ',
  },
  {
    to: '/admin/bkash-sms',
    group: 'billing',
    label: (t) => t.nav.bkashSms,
    permission: 'SYSTEM_SETTINGS_WRITE',
  },
  {
    to: '/admin/broadcast',
    group: 'people',
    label: (t) => t.nav.broadcast,
    permission: 'SMS_BROADCAST',
  },
  {
    to: '/admin/system',
    group: 'settings',
    label: (t) => t.nav.system,
    permission: 'SYSTEM_SETTINGS_WRITE',
  },
  {
    to: '/admin/sms',
    group: 'settings',
    label: (t) => t.nav.smsTemplates,
    permission: 'SYSTEM_SETTINGS_WRITE',
  },
  { to: '/admin/audit', group: 'settings', label: (t) => t.nav.auditLog, permission: 'AUDIT_READ' },
  { to: '/admin/users', group: 'settings', label: (t) => t.nav.users, permission: 'USER_MANAGE' },
];
