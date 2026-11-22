import { randomInt } from 'node:crypto';
import type { SecretBox } from './secret-box.js';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters (0/o, 1/l/i)
const GENERATED_LENGTH = 8;

/** Handles the PPPoE passwords the system keeps so it can create router accounts (encrypted at rest). */
export class PppoeCredentials {
  constructor(private readonly box: SecretBox) {}

  /**
   * Password to store for a new customer: only router-managed PPPoE customers need one.
   * Generated when the admin did not type one.
   */
  forNewCustomer(input: {
    connectionType: string;
    pppoeUsername?: string | undefined;
    routerId?: string | undefined;
    pppoePassword?: string | undefined;
  }): string | undefined {
    if (input.connectionType !== 'PPPOE' || !input.pppoeUsername || !input.routerId) {
      return undefined;
    }
    try {
      return this.box.encrypt(input.pppoePassword ?? PppoeCredentials.generate());
    } catch {
      return undefined; // ROUTER_SECRET missing: the account can only be switched, not created
    }
  }

  reveal(sealed: string): string {
    return this.box.decrypt(sealed);
  }

  static generate(): string {
    return Array.from(
      { length: GENERATED_LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join('');
  }
}
