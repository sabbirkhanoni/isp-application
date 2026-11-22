import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Behind the Cloudflare Pages proxy every request reaches the API from a Cloudflare address, so rate
 * limits and audit logs would see one "user". The proxy therefore sends the real visitor address in
 * X-Forwarded-For together with a shared secret. Only when that secret matches do we believe the header;
 * a request that goes straight to the API cannot choose its own IP.
 */
export function createTrustedClientIp(proxySecret: string | undefined): RequestHandler {
  return (req, _res, next) => {
    const provided = req.header('x-proxy-secret');
    if (proxySecret && provided && sameSecret(provided, proxySecret)) {
      const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
      if (forwarded) Object.defineProperty(req, 'ip', { value: forwarded, configurable: true });
    }
    next();
  };
}
