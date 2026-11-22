import {
  changePasswordSchema,
  loginSchema,
  updatePreferencesSchema,
  type AuthUserDto,
} from '@isp/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { UnauthenticatedError } from '../../shared/errors/app-error.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import { toAuthUserDto } from './auth.mapper.js';
import type { AuthService } from './auth.service.js';
import type { AuthContext } from './auth.types.js';

export interface CookieSettings {
  name: string;
  secure: boolean;
}

function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
}

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly cookie: CookieSettings,
  ) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.cookie.secure, sameSite: 'lax', path: '/' };
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(loginSchema, req.body);
    const result = await this.service.login(input, getRequestContext(req));
    res.cookie(this.cookie.name, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    sendData<AuthUserDto>(res, 200, result.user);
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.service.logout(requireAuth(req), getRequestContext(req));
    res.clearCookie(this.cookie.name, this.cookieOptions());
    res.status(204).end();
  };

  me = (req: Request, res: Response): void => {
    sendData<AuthUserDto>(res, 200, toAuthUserDto(requireAuth(req)));
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(changePasswordSchema, req.body);
    await this.service.changePassword(requireAuth(req), input, getRequestContext(req));
    res.status(204).end();
  };

  updatePreferences = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updatePreferencesSchema, req.body);
    const auth = requireAuth(req);
    await this.service.updateLanguage(auth, input.language);
    sendData<AuthUserDto>(res, 200, toAuthUserDto({ ...auth, language: input.language }));
  };
}
