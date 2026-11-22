import type { LineDto, NetworkJobDto, RouterDto } from '@isp/contracts';
import type { JobWithNames, LineRow, RouterWithCount } from './network.repository.js';

export function toRouterDto(router: RouterWithCount): RouterDto {
  return {
    id: router.id,
    name: router.name,
    driver: router.driver,
    host: router.host,
    port: router.port,
    useTls: router.useTls,
    allowSelfSigned: router.allowSelfSigned,
    username: router.username,
    hasPassword: router.passwordEnc !== null,
    isActive: router.isActive,
    lastSeenAt: router.lastSeenAt?.toISOString() ?? null,
    lastError: router.lastError,
    customerCount: router._count.subscriptions,
    onlineCount: router.onlineCount,
  };
}

export function toLineDto(row: LineRow): LineDto {
  return {
    ...row,
    onlineSince: row.onlineSince?.toISOString() ?? null,
    lastOnlineAt: row.lastOnlineAt?.toISOString() ?? null,
    routerCheckedAt: row.routerCheckedAt?.toISOString() ?? null,
  };
}

export function toNetworkJobDto(job: JobWithNames): NetworkJobDto {
  return {
    id: job.id,
    customerId: job.customerId,
    customerCode: job.customer.customerCode,
    customerName: job.customer.fullName,
    routerId: job.routerId,
    routerName: job.router.name,
    status: job.status,
    attempts: job.attempts,
    lastError: job.lastError,
    appliedState:
      job.status === 'DONE' && (job.appliedState === 'ENABLED' || job.appliedState === 'DISABLED')
        ? job.appliedState
        : null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
