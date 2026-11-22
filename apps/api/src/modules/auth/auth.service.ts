import type { AuthUserDto, ChangePasswordInput, Language, LoginInput } from '@isp/contracts';
import { InvalidCredentialsError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import { toAuthContext, toAuthUserDto } from './auth.mapper.js';
import type { AuthContext, RequestContext } from './auth.types.js';
import type { CredentialRepository } from './credentials.repository.js';
import type { PasswordHasher } from './password-hasher.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';
import type { SessionRepository } from './session.repository.js';

export interface AuthServiceOptions {
  sessionTtlHours: number;
  loginMaxFailures: number;
  loginLockMinutes: number;
}

export interface LoginResult {
  user: AuthUserDto;
  token: string;
  expiresAt: Date;
}

const LAST_SEEN_UPDATE_INTERVAL_MS = 60_000;

export class AuthService {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
    private readonly options: AuthServiceOptions,
  ) {}

  async login(input: LoginInput, context: RequestContext): Promise<LoginResult> {
    const now = this.clock.now();
    const user = await this.credentials.findByUsername(input.username);

    if (!user) {
      await this.hasher.verifyAgainstDummy(input.password);
      await this.auditFailedLogin(null, 'UNKNOWN_USER', context);
      throw new InvalidCredentialsError();
    }
    if (user.status !== 'ACTIVE') {
      await this.hasher.verifyAgainstDummy(input.password);
      await this.auditFailedLogin(user.id, 'ACCOUNT_DISABLED', context);
      throw new InvalidCredentialsError();
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.hasher.verifyAgainstDummy(input.password);
      await this.auditFailedLogin(user.id, 'ACCOUNT_LOCKED', context);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      const failures = await this.credentials.incrementFailedLogins(user.id);
      if (failures >= this.options.loginMaxFailures) {
        const until = new Date(now.getTime() + this.options.loginLockMinutes * 60_000);
        await this.credentials.lockUntil(user.id, until);
      }
      await this.auditFailedLogin(user.id, 'WRONG_PASSWORD', context, { failures });
      throw new InvalidCredentialsError();
    }

    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlHours * 3_600_000);
    const session = await this.sessions.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    await this.credentials.recordSuccessfulLogin(user.id, now);
    await this.audit.record({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
      targetType: 'user',
      targetId: user.id,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });

    return { user: toAuthUserDto(toAuthContext(session.id, user)), token, expiresAt };
  }

  /** Resolves a session cookie value to an authenticated context, or null if it is not valid. */
  async authenticate(token: string): Promise<AuthContext | null> {
    const now = this.clock.now();
    const session = await this.sessions.findActiveByTokenHash(hashSessionToken(token), now);
    if (!session || session.user.status !== 'ACTIVE') return null;

    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
      await this.sessions.touch(session.id, now);
    }
    return toAuthContext(session.id, session.user);
  }

  async logout(auth: AuthContext, context: RequestContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId, this.clock.now());
    await this.audit.record({
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.LOGOUT,
      targetType: 'user',
      targetId: auth.userId,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }

  async changePassword(
    auth: AuthContext,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.credentials.findById(auth.userId);
    const currentMatches = user
      ? await this.hasher.verify(user.passwordHash, input.currentPassword)
      : false;
    if (!user || !currentMatches) {
      await this.audit.record({
        actorUserId: auth.userId,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        targetType: 'user',
        targetId: auth.userId,
        outcome: 'FAILURE',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      });
      throw new InvalidCredentialsError();
    }

    await this.credentials.updatePassword(user.id, await this.hasher.hash(input.newPassword));
    await this.sessions.revokeAllForUser(user.id, this.clock.now(), auth.sessionId);
    await this.audit.record({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      targetType: 'user',
      targetId: user.id,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }

  async updateLanguage(auth: AuthContext, language: Language): Promise<void> {
    await this.credentials.updateLanguage(auth.userId, language);
  }

  private async auditFailedLogin(
    userId: string | null,
    reason: string,
    context: RequestContext,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.record({
      actorUserId: userId,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      targetType: 'user',
      targetId: userId ?? undefined,
      outcome: 'FAILURE',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      metadata: { reason, ...extra },
    });
  }
}
