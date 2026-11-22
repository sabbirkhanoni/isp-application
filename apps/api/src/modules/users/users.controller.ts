import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { UnauthenticatedError, ValidationError } from '../../shared/errors/app-error.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { UserService } from './users.service.js';

function requireActor(req: Request): AuthContext {
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
}

function requireIdParam(req: Request): string {
  const id = req.params['id'];
  if (typeof id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new ValidationError('Invalid user id.');
  }
  return id;
}

export class UsersController {
  constructor(private readonly service: UserService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createUserSchema, req.body);
    const user = await this.service.create(requireActor(req), input, getRequestContext(req));
    sendData(res, 201, user);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = parseRequest(listUsersQuerySchema, req.query);
    const { items, pagination } = await this.service.list(query);
    sendData(res, 200, items, { pagination });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.getById(requireIdParam(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updateUserSchema, req.body);
    const user = await this.service.update(
      requireActor(req),
      requireIdParam(req),
      input,
      getRequestContext(req),
    );
    sendData(res, 200, user);
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(resetPasswordSchema, req.body);
    await this.service.resetPassword(
      requireActor(req),
      requireIdParam(req),
      input,
      getRequestContext(req),
    );
    res.status(204).end();
  };
}
