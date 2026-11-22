import type { Request } from 'express';
import { UnauthenticatedError, ValidationError } from '../errors/app-error.js';
import type { AuthContext } from '../../modules/auth/auth.types.js';

export function requireActor(req: Request): AuthContext {
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
}

export function requireIdParam(req: Request, label = 'id'): string {
  const id = req.params['id'];
  if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new ValidationError(`Invalid ${label}.`);
  }
  return id;
}
