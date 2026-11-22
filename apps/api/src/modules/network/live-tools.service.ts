import type { KickResultDto, LiveTrafficDto, MacLockDto, PingResultDto } from '@isp/contracts';
import { NotFoundError, ValidationError } from '../../shared/errors/app-error.js';
import { AUDIT_ACTIONS, type AuditRecorder } from '../audit/audit.types.js';
import type { AuthContext, RequestContext } from '../auth/auth.types.js';
import type { NetworkRepository } from './network.repository.js';
import type { RouterGateway, RouterTarget } from './router-gateway.js';
import { RouterError } from './router-gateway.js';
import type { RouterService } from './routers.service.js';

const PING_COUNT = 4;

interface LineContext {
  customerId: string;
  pppoeUsername: string;
  online: boolean;
  address: string | null;
  currentMac: string | null;
  target: RouterTarget;
}

/**
 * Live, on-demand actions against the customer's own router (ping, restart session, speed, MAC lock).
 * They need a direct connection; routers that only report through the agent cannot answer right now.
 */
export class LiveToolsService {
  constructor(
    private readonly repo: NetworkRepository,
    private readonly routers: RouterService,
    private readonly gateway: RouterGateway,
    private readonly audit: AuditRecorder,
  ) {}

  async ping(customerId: string): Promise<PingResultDto> {
    const line = await this.load(customerId);
    if (!line.online || !line.address) {
      throw new ValidationError('The customer is offline, so there is nothing to ping.');
    }
    const result = await this.run(() =>
      this.gateway.pingFrom(line.target, line.address as string, PING_COUNT),
    );
    return { ...result, address: line.address };
  }

  async kick(actor: AuthContext, customerId: string, ctx: RequestContext): Promise<KickResultDto> {
    const line = await this.load(customerId);
    const dropped = await this.run(() => this.gateway.kickSession(line.target, line.pppoeUsername));
    await this.record(actor, AUDIT_ACTIONS.SESSION_KICKED, customerId, ctx, { dropped });
    return { dropped };
  }

  async traffic(customerId: string): Promise<LiveTrafficDto> {
    const line = await this.load(customerId);
    const rate = await this.run(() => this.gateway.liveRate(line.target, line.pppoeUsername));
    if (!rate) return { online: false, downloadMbps: 0, uploadMbps: 0 };
    // On the PPPoE interface "tx" leaves the router towards the customer, i.e. the customer's download.
    return {
      online: true,
      downloadMbps: toMbps(rate.txBps),
      uploadMbps: toMbps(rate.rxBps),
    };
  }

  async macState(customerId: string): Promise<MacLockDto> {
    const line = await this.load(customerId);
    const lockedMac = await this.run(() =>
      this.gateway.getMacLock(line.target, line.pppoeUsername),
    );
    return { lockedMac, currentMac: line.currentMac };
  }

  /** Locks the login to `mac`, or to the MAC the customer is connected with now. */
  async lockMac(
    actor: AuthContext,
    customerId: string,
    mac: string | undefined,
    ctx: RequestContext,
  ): Promise<MacLockDto> {
    const line = await this.load(customerId);
    const chosen = mac ?? line.currentMac;
    if (!chosen) {
      throw new ValidationError(
        'The customer is offline, so their MAC is not known. Type the MAC address to lock to.',
      );
    }
    await this.run(() => this.gateway.setMacLock(line.target, line.pppoeUsername, chosen));
    await this.record(actor, AUDIT_ACTIONS.MAC_LOCK_SET, customerId, ctx, { mac: chosen });
    return { lockedMac: chosen, currentMac: line.currentMac };
  }

  /** Removes the lock so a new router can connect; the next lock then picks up the new MAC. */
  async resetMac(actor: AuthContext, customerId: string, ctx: RequestContext): Promise<MacLockDto> {
    const line = await this.load(customerId);
    await this.run(() => this.gateway.setMacLock(line.target, line.pppoeUsername, null));
    await this.record(actor, AUDIT_ACTIONS.MAC_LOCK_REMOVED, customerId, ctx, {});
    return { lockedMac: null, currentMac: line.currentMac };
  }

  private async load(customerId: string): Promise<LineContext> {
    const line = await this.repo.findLine(customerId);
    if (!line) throw new NotFoundError('This customer is not managed on a router.');
    const router = await this.repo.findRouter(line.routerId);
    if (!router) throw new NotFoundError('Router not found.');
    if (router.driver !== 'REST') {
      throw new ValidationError(
        'This router is connected through the agent, so live tools are not available for it.',
      );
    }
    return {
      customerId,
      pppoeUsername: line.pppoeUsername,
      online: line.state === 'ONLINE',
      address: line.address,
      currentMac: line.callerId,
      target: this.routers.targetOf(router),
    };
  }

  /** Router problems are shown to the user as a plain message, not as a server error. */
  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RouterError) throw new ValidationError(error.message);
      throw error;
    }
  }

  private record(
    actor: AuthContext,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    customerId: string,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      actorUserId: actor.userId,
      action,
      targetType: 'customer',
      targetId: customerId,
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ipAddress,
      metadata,
    });
  }
}

function toMbps(bitsPerSecond: number): number {
  return Math.round((bitsPerSecond / 1_000_000) * 100) / 100;
}
