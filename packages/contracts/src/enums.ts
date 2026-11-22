export const ROLES = ['ADMIN', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LANGUAGES = ['bn', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'bn';

export const CONNECTION_TYPES = ['PPPOE', 'DHCP', 'STATIC', 'HOTSPOT'] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

/** Chosen by the admin when approving a lead or creating a customer directly. */
export const ACTIVATION_POLICIES = ['ACTIVATE_NOW', 'AFTER_FIRST_PAYMENT', 'MANUAL'] as const;
export type ActivationPolicy = (typeof ACTIVATION_POLICIES)[number];

export const CUSTOMER_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
  'TERMINATED',
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const LEAD_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'BKASH'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['POSTED', 'REVERSED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BKASH_TX_STATUSES = [
  'POSTED',
  'VERIFIED',
  'NEEDS_REVIEW',
  'ASSIGNED',
  'IGNORED',
] as const;
export type BkashTxStatus = (typeof BKASH_TX_STATUSES)[number];

export const BKASH_REVIEW_REASONS = [
  'NO_REFERENCE_MATCH',
  'PHONE_SUGGESTION',
  'AMOUNT_MISMATCH',
] as const;
export type BkashReviewReason = (typeof BKASH_REVIEW_REASONS)[number];

export const ROUTER_DRIVERS = ['REST', 'AGENT'] as const;
export type RouterDriver = (typeof ROUTER_DRIVERS)[number];

export const NETWORK_JOB_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'FAILED'] as const;
export type NetworkJobStatus = (typeof NETWORK_JOB_STATUSES)[number];

/** NON_PAYMENT suspensions are lifted automatically when the overdue bills are paid. */
export const SUSPEND_REASONS = ['NON_PAYMENT', 'MANUAL'] as const;
export type SuspendReason = (typeof SUSPEND_REASONS)[number];
