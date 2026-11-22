import type { Logger } from '../../shared/logger/logger.js';

/** Port: anything that can deliver one SMS. Throwing means "not delivered, retry later". */
export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

/** Safe default: records the message in the log only. Used in development and tests. */
export class LogSmsSender implements SmsSender {
  constructor(private readonly logger: Logger) {}

  async send(phone: string, message: string): Promise<void> {
    this.logger.info({ phone, chars: message.length }, 'SMS (log driver, not actually sent)');
  }
}

export interface HttpSmsOptions {
  apiUrl: string;
  apiKey: string;
  senderId?: string | undefined;
  timeoutMs?: number;
}

/**
 * Generic JSON-over-HTTPS gateway: POST { to, message, sender_id } with a Bearer key.
 * Providers differ; adjust `buildBody`/headers here only (one place) once the provider is chosen.
 */
export class HttpSmsSender implements SmsSender {
  constructor(private readonly options: HttpSmsOptions) {}

  async send(phone: string, message: string): Promise<void> {
    const response = await fetch(this.options.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        to: `88${phone}`,
        message,
        ...(this.options.senderId ? { sender_id: this.options.senderId } : {}),
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new Error(`SMS gateway responded ${response.status}`);
  }
}
