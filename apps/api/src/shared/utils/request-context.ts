import type { Request } from 'express';
import type { RequestContext } from '../../modules/auth/auth.types.js';

export function getRequestContext(req: Request): RequestContext {
  return {
    requestId: req.requestId,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
  };
}
