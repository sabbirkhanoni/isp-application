import { rateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../errors/app-error.js';

interface Options {
  windowMs: number;
  limit: number;
}

/** In-memory limiter: resets on restart, which is acceptable for a single-instance pilot. */
export function createRateLimiter({ windowMs, limit }: Options) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitedError()),
  });
}
