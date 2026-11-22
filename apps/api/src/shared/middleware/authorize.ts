import type { Permission } from '@isp/contracts';
import type { RequestHandler } from 'express';
import { AUDIT_ACTIONS, type AuditRecorder } from '../../modules/audit/audit.types.js';
import {
  ForbiddenError,
  PasswordChangeRequiredError,
  UnauthenticatedError,
} from '../errors/app-error.js';

export type AuthorizeFactory = (...required: Permission[]) => RequestHandler;

/**
 * Deny-by-default permission check. Must run after `authenticate`.
 * Accounts that still use a temporary password cannot reach any protected business route.
 */
export function createAuthorize(audit: AuditRecorder): AuthorizeFactory {
  return (...required) =>
    async (req, _res, next) => {
      const auth = req.auth;
      if (!auth) return next(new UnauthenticatedError());
      if (auth.mustChangePassword) return next(new PasswordChangeRequiredError());

      const missing = required.filter((permission) => !auth.permissions.includes(permission));
      if (missing.length > 0) {
        await audit.record({
          actorUserId: auth.userId,
          action: AUDIT_ACTIONS.PERMISSION_DENIED,
          outcome: 'DENIED',
          requestId: req.requestId,
          ipAddress: req.ip ?? null,
          metadata: { method: req.method, path: req.path, missing },
        });
        return next(new ForbiddenError());
      }
      return next();
    };
}
