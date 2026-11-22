import type {
  CreateUserInput,
  ListUsersQuery,
  PaginationMeta,
  ResetPasswordInput,
  UpdateUserInput,
  UserDto,
} from '@isp/contracts';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { PasswordHasher } from '../auth/password-hasher.js';
import { toUserDto } from './users.mapper.js';
import type { UserRepository } from './users.repository.js';
import type { SessionRevoker, UserPatch } from './users.types.js';

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionRevoker,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async create(
    actor: AuthContext,
    input: CreateUserInput,
    context: RequestContext,
  ): Promise<UserDto> {
    if (await this.users.findByUsername(input.username)) {
      throw new ConflictError('This username is already taken.');
    }
    const user = await this.users.create({
      username: input.username,
      fullName: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      passwordHash: await this.hasher.hash(input.temporaryPassword),
      mustChangePassword: true,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.USER_CREATED,
      targetType: 'user',
      targetId: user.id,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      metadata: { username: user.username, role: user.role },
    });
    return toUserDto(user);
  }

  async list(query: ListUsersQuery): Promise<{ items: UserDto[]; pagination: PaginationMeta }> {
    const { items, total } = await this.users.list(query.page, query.limit);
    return {
      items: items.map(toUserDto),
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async getById(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found.');
    return toUserDto(user);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateUserInput,
    context: RequestContext,
  ): Promise<UserDto> {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError('User not found.');

    const disabling = input.status === 'DISABLED' && target.status !== 'DISABLED';
    const demoting =
      input.role !== undefined && input.role !== target.role && target.role === 'ADMIN';

    if (actor.userId === id && (disabling || (input.role && input.role !== target.role))) {
      throw new ConflictError('You cannot disable or change the role of your own account.');
    }
    if (target.role === 'ADMIN' && target.status === 'ACTIVE' && (disabling || demoting)) {
      if ((await this.users.countActiveAdmins()) <= 1) {
        throw new ConflictError('At least one active admin account is required.');
      }
    }

    const patch: UserPatch = {};
    if (input.fullName !== undefined) patch.fullName = input.fullName;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.role !== undefined) patch.role = input.role;
    if (input.status !== undefined) patch.status = input.status;
    if (input.extraPermissions !== undefined) patch.extraPermissions = input.extraPermissions;
    const updated = await this.users.update(id, patch);

    if (disabling) await this.sessions.revokeAllForUser(id, this.clock.now());

    await this.audit.record({
      actorUserId: actor.userId,
      action: disabling ? AUDIT_ACTIONS.USER_DISABLED : AUDIT_ACTIONS.USER_UPDATED,
      targetType: 'user',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      metadata: { changedFields: Object.keys(patch) },
    });
    return toUserDto(updated);
  }

  async resetPassword(
    actor: AuthContext,
    id: string,
    input: ResetPasswordInput,
    context: RequestContext,
  ): Promise<void> {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError('User not found.');

    await this.users.update(id, {
      passwordHash: await this.hasher.hash(input.temporaryPassword),
      mustChangePassword: true,
    });
    await this.sessions.revokeAllForUser(id, this.clock.now());
    await this.audit.record({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      targetType: 'user',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    });
  }
}
