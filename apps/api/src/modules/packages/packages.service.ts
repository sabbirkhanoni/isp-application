import type { CreatePackageInput, PackageDto, UpdatePackageInput } from '@isp/contracts';
import { isUniqueViolation } from '../../shared/database/errors.js';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toPackageDto } from './packages.mapper.js';
import type { PackageRepository } from './packages.repository.js';

export class PackageService {
  constructor(
    private readonly packages: PackageRepository,
    private readonly audit: AuditRecorder,
  ) {}

  /** Staff only ever see sellable (active) packages; admins also see retired ones. */
  async list(actor: AuthContext): Promise<PackageDto[]> {
    const includeInactive = actor.permissions.includes('PACKAGE_WRITE');
    return (await this.packages.list(includeInactive)).map(toPackageDto);
  }

  async create(
    actor: AuthContext,
    input: CreatePackageInput,
    ctx: RequestContext,
  ): Promise<PackageDto> {
    if (await this.packages.findByName(input.name))
      throw new ConflictError('Package name already exists.');
    try {
      const created = await this.packages.create(input);
      await this.record(actor, AUDIT_ACTIONS.PACKAGE_CREATED, created.id, ctx, {
        name: created.name,
      });
      return toPackageDto(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Package name already exists.');
      throw error;
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdatePackageInput,
    ctx: RequestContext,
  ): Promise<PackageDto> {
    if (!(await this.packages.findById(id))) throw new NotFoundError('Package not found.');
    try {
      const updated = await this.packages.update(id, input);
      await this.record(actor, AUDIT_ACTIONS.PACKAGE_UPDATED, id, ctx, {
        changedFields: Object.keys(input),
      });
      return toPackageDto(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError('Package name already exists.');
      throw error;
    }
  }

  private record(
    actor: AuthContext,
    action: (typeof AUDIT_ACTIONS)['PACKAGE_CREATED' | 'PACKAGE_UPDATED'],
    id: string,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'package',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}
