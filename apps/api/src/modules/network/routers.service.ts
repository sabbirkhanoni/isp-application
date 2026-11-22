import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  CreateRouterInput,
  RouterDto,
  RouterTestResultDto,
  RouterWithTokenDto,
  UpdateRouterInput,
} from '@isp/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import type { Clock } from '../../shared/utils/clock.js';
import { AUDIT_ACTIONS, type AuditAction, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import { toRouterDto } from './network.mapper.js';
import type { NetworkRepository, RouterWithCount } from './network.repository.js';
import type { RouterGateway, RouterTarget } from './router-gateway.js';
import { RouterError } from './router-gateway.js';
import type { SecretBox } from './secret-box.js';

const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export class RouterService {
  constructor(
    private readonly repo: NetworkRepository,
    private readonly gateway: RouterGateway,
    private readonly secrets: SecretBox,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<RouterDto[]> {
    return (await this.repo.listRouters()).map(toRouterDto);
  }

  async create(
    actor: AuthContext,
    input: CreateRouterInput,
    ctx: RequestContext,
  ): Promise<RouterWithTokenDto> {
    if (await this.repo.findRouterByName(input.name)) {
      throw new ConflictError('A router with this name already exists.');
    }
    const id = randomUUID();
    const token = input.driver === 'AGENT' ? this.newToken(id) : null;
    const created = await this.repo.createRouter({
      id,
      name: input.name,
      driver: input.driver,
      host: input.host ?? null,
      port: input.port,
      useTls: input.useTls,
      allowSelfSigned: input.allowSelfSigned,
      username: input.username ?? null,
      passwordEnc: input.password ? this.seal(input.password) : null,
      agentTokenHash: token ? hashSecret(token.secret) : null,
    });
    await this.record(actor, AUDIT_ACTIONS.ROUTER_CREATED, created.id, ctx, {
      name: created.name,
      driver: created.driver,
    });
    return { router: toRouterDto(created), agentToken: token?.full ?? null };
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateRouterInput,
    ctx: RequestContext,
  ): Promise<RouterDto> {
    const current = await this.require(id);
    if (input.name && input.name.toLowerCase() !== current.name.toLowerCase()) {
      if (await this.repo.findRouterByName(input.name)) {
        throw new ConflictError('A router with this name already exists.');
      }
    }
    const { password, ...rest } = input;
    const updated = await this.repo.updateRouter(id, {
      ...rest,
      ...(password ? { passwordEnc: this.seal(password) } : {}),
    });
    await this.record(actor, AUDIT_ACTIONS.ROUTER_UPDATED, id, ctx, {
      changedFields: Object.keys(input).map((f) => (f === 'password' ? 'password' : f)),
    });
    return toRouterDto(updated);
  }

  async rotateToken(
    actor: AuthContext,
    id: string,
    ctx: RequestContext,
  ): Promise<RouterWithTokenDto> {
    const router = await this.require(id);
    if (router.driver !== 'AGENT') {
      throw new ValidationError('Only routers that use the agent have a token.');
    }
    const token = this.newToken(id);
    const updated = await this.repo.updateRouter(id, { agentTokenHash: hashSecret(token.secret) });
    await this.record(actor, AUDIT_ACTIONS.ROUTER_TOKEN_ROTATED, id, ctx, {});
    return { router: toRouterDto(updated), agentToken: token.full };
  }

  async test(id: string): Promise<RouterTestResultDto> {
    const router = await this.require(id);
    if (router.driver === 'AGENT') {
      return {
        ok: router.lastSeenAt !== null,
        message: router.lastSeenAt
          ? `Agent last contacted at ${router.lastSeenAt.toISOString()}`
          : 'The agent has not contacted the server yet',
      };
    }
    try {
      const info = await this.gateway.ping(this.targetOf(router));
      await this.repo.markRouterSeen(id, this.clock.now(), null);
      return { ok: true, message: `Connected: ${info.identity}, RouterOS ${info.version}` };
    } catch (error) {
      const message = error instanceof RouterError ? error.message : 'Could not connect';
      await this.repo.markRouterSeen(id, this.clock.now(), message);
      return { ok: false, message };
    }
  }

  /** Resolves an agent bearer token (`<routerId>.<secret>`) to its router, or null. */
  async authenticateAgent(token: string): Promise<RouterWithCount | null> {
    const [id, secret] = token.split('.', 2);
    if (!id || !secret || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const router = await this.repo.findRouter(id);
    if (!router || !router.isActive || router.driver !== 'AGENT' || !router.agentTokenHash) {
      return null;
    }
    const expected = Buffer.from(router.agentTokenHash, 'hex');
    const actual = Buffer.from(hashSecret(secret), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? router : null;
  }

  targetOf(router: RouterTargetSource): RouterTarget {
    if (!router.host || !router.username || !router.passwordEnc) {
      throw new RouterError('ROUTER_ERROR', 'Router connection details are incomplete', false);
    }
    return {
      host: router.host,
      port: router.port,
      useTls: router.useTls,
      allowSelfSigned: router.allowSelfSigned,
      username: router.username,
      password: this.secrets.decrypt(router.passwordEnc),
    };
  }

  private newToken(routerId: string): { full: string; secret: string } {
    const secret = randomBytes(24).toString('base64url');
    return { full: `${routerId}.${secret}`, secret };
  }

  private seal(password: string): string {
    try {
      return this.secrets.encrypt(password);
    } catch {
      throw new ValidationError(
        'Router passwords cannot be saved: ROUTER_SECRET is not configured on the server.',
      );
    }
  }

  private async require(id: string): Promise<RouterWithCount> {
    const router = await this.repo.findRouter(id);
    if (!router) throw new NotFoundError('Router not found.');
    return router;
  }

  private record(
    actor: AuthContext,
    action: AuditAction,
    id: string,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'router',
      targetId: id,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}

interface RouterTargetSource {
  host: string | null;
  port: number;
  useTls: boolean;
  allowSelfSigned: boolean;
  username: string | null;
  passwordEnc: string | null;
}
