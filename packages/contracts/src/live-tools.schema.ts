import { z } from 'zod';

/** A MAC address as RouterOS writes it, e.g. 04:D4:C4:12:AB:34. */
export const macAddressSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/, 'Use a MAC address like 04:D4:C4:12:AB:34');

export const lockMacSchema = z.object({
  /** Leave empty to lock to the MAC the customer is connected with right now. */
  mac: macAddressSchema.optional(),
});
export type LockMacInput = z.infer<typeof lockMacSchema>;

export interface PingResultDto {
  sent: number;
  received: number;
  lossPercent: number;
  avgMs: number | null;
  /** The address that was pinged (the customer's session IP). */
  address: string;
}

export interface LiveTrafficDto {
  online: boolean;
  /** Speed towards the customer (download) and from the customer (upload), in megabits per second. */
  downloadMbps: number;
  uploadMbps: number;
}

export interface MacLockDto {
  /** The MAC the account is locked to; null = anyone with the password can connect. */
  lockedMac: string | null;
  /** The MAC of the customer's router right now; null when offline. */
  currentMac: string | null;
}

export interface KickResultDto {
  dropped: number;
}
