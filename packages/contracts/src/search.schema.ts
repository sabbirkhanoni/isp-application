import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
});

export interface SearchCustomerDto {
  id: string;
  customerCode: string;
  fullName: string;
  phone: string;
  area: string | null;
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  isFree: boolean;
  pppoeUsername: string | null;
  /** All unpaid bills, in poisha. */
  dueAmountPoisha: number;
  /** null = not a monitored PPPoE line. */
  online: boolean | null;
}
