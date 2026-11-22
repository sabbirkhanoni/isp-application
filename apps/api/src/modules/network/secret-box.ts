import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Port for protecting router passwords at rest. */
export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(sealed: string): string;
}

/** AES-256-GCM. Stored form: base64(iv ‖ authTag ‖ ciphertext). The key is derived from ROUTER_SECRET. */
export class AesSecretBox implements SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  decrypt(sealed: string): string {
    const raw = Buffer.from(sealed, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}

/** Used when ROUTER_SECRET is not configured: saving a router password is refused. */
export class MissingSecretBox implements SecretBox {
  encrypt(): string {
    throw new Error('ROUTER_SECRET is not configured');
  }
  decrypt(): string {
    throw new Error('ROUTER_SECRET is not configured');
  }
}
