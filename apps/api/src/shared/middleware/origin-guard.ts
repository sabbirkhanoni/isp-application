import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (cookies are also SameSite=Lax): state-changing requests that carry an
 * Origin header must come from an allowed origin or from the API's own host.
 */
export function createOriginGuard(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();

    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      return next(new ForbiddenError('Invalid origin.'));
    }
    if (allowedOrigins.includes(origin) || originHost === req.get('host')) return next();
    return next(new ForbiddenError('Origin is not allowed.'));
  };
}
