import type { RequestHandler } from 'express';
import type { AuthService } from '../../modules/auth/auth.service.js';
import { UnauthenticatedError } from '../errors/app-error.js';

export function createAuthenticate(authService: AuthService, cookieName: string): RequestHandler {
  return async (req, _res, next) => {
    const token = req.cookies?.[cookieName] as unknown;
    if (typeof token !== 'string' || token.length === 0) return next(new UnauthenticatedError());

    const auth = await authService.authenticate(token);
    if (!auth) return next(new UnauthenticatedError());

    req.auth = auth;
    return next();
  };
}
