import type {
  BillingSettings,
  ChargeDto,
  CreateChargeInput,
  CustomerBillingDto,
  InvoiceDetailDto,
  MovePaymentInput,
  ReceiptDto,
  SetDiscountInput,
  GenerateInvoicesResultDto,
  InvoiceDto,
  PaginationMeta,
  PaymentDto,
  RecordPaymentInput,
} from '@isp/contracts';
import { api } from '@/lib/api-client';

export const billingKey = ['billing'] as const;
export const customerBillingKey = (customerId: string) =>
  [...billingKey, 'customer', customerId] as const;

export interface InvoiceFilters {
  page: number;
  period: string;
  search: string;
  unpaidOnly: boolean;
}

export async function fetchInvoices(filters: InvoiceFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
  if (filters.period) params.set('period', filters.period);
  if (filters.search) params.set('search', filters.search);
  if (filters.unpaidOnly) params.set('unpaidOnly', 'true');
  const res = await api.get<InvoiceDto[]>(`/invoices?${params}`);
  return { invoices: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

export async function fetchPayments(page: number) {
  const res = await api.get<PaymentDto[]>(`/payments?page=${page}&limit=20`);
  return { payments: res.data, pagination: res.meta['pagination'] as PaginationMeta };
}

export const fetchCustomerBilling = async (customerId: string) =>
  (await api.get<CustomerBillingDto>(`/customers/${customerId}/billing`)).data;

export const generateInvoices = (period?: string) =>
  api.post<GenerateInvoicesResultDto>('/invoices/generate', period ? { period } : {});
export const recordPayment = (input: RecordPaymentInput) =>
  api.post<PaymentDto>('/payments', input);
export const reversePayment = (id: string, reason: string) =>
  api.post<PaymentDto>(`/payments/${id}/reverse`, { reason });

export const fetchReceipt = async (id: string) =>
  (await api.get<ReceiptDto>(`/payments/${id}`)).data;
export const fetchInvoiceDetail = async (id: string) =>
  (await api.get<InvoiceDetailDto>(`/invoices/${id}`)).data;
export const movePayment = (id: string, input: MovePaymentInput) =>
  api.post<PaymentDto>(`/payments/${id}/move`, input);

export const addCharge = (customerId: string, input: CreateChargeInput) =>
  api.post<ChargeDto>(`/adjustments/customers/${customerId}/charges`, input);
export const cancelCharge = (id: string) => api.delete<void>(`/adjustments/charges/${id}`);
export const setDiscount = (customerId: string, input: SetDiscountInput) =>
  api.put<void>(`/adjustments/customers/${customerId}/discount`, input);

export const billingSettingsKey = ['billing-settings'] as const;
export const fetchBillingSettings = async () =>
  (await api.get<BillingSettings>('/billing-settings')).data;
export const saveBillingSettings = (input: BillingSettings) =>
  api.put<BillingSettings>('/billing-settings', input);
