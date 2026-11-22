import http from 'node:http';
import https from 'node:https';
import {
  RouterError,
  type ApplyOptions,
  type ApplyResult,
  type RouterSecretInfo,
  type LiveRate,
  type LiveSession,
  type PingResult,
  type RouterGateway,
  type RouterTarget,
} from './router-gateway.js';

const TIMEOUT_MS = 15_000;

interface RouterResponse {
  status: number;
  body: unknown;
}

/**
 * RouterOS v7 REST driver (https://<router>/rest/<menu>, HTTP Basic auth).
 * Paths follow RouterOS' menu-to-URL rule (/ppp/secret -> /rest/ppp/secret); they were checked against
 * a mock only, so verify them on the first real router (see docs/phase-5-network.md).
 */
export class RouterOsRestGateway implements RouterGateway {
  async setPppoeEnabled(
    target: RouterTarget,
    pppoeUsername: string,
    enabled: boolean,
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    const name = encodeURIComponent(pppoeUsername);
    const secrets = await this.call(target, 'GET', `/rest/ppp/secret?name=${name}`);
    const secret = Array.isArray(secrets.body)
      ? (secrets.body[0] as { '.id'?: string; profile?: string })
      : undefined;

    if (!secret?.['.id']) {
      if (!options?.password) {
        throw new RouterError(
          'SECRET_NOT_FOUND',
          `PPPoE user "${pppoeUsername}" does not exist on this router`,
          false,
        );
      }
      await this.call(target, 'PUT', '/rest/ppp/secret', {
        name: pppoeUsername,
        password: options.password,
        service: 'pppoe',
        disabled: enabled ? 'false' : 'true',
        ...(options.profile ? { profile: options.profile } : {}),
      });
      return { created: true };
    }

    const profileChanged = Boolean(options?.profile) && secret.profile !== options?.profile;
    await this.call(target, 'PATCH', `/rest/ppp/secret/${secret['.id']}`, {
      disabled: enabled ? 'false' : 'true',
      ...(profileChanged ? { profile: options?.profile } : {}),
    });

    if (!enabled || profileChanged) {
      // A session that is already up keeps its old state; remove it so the change applies now
      // (the customer's router reconnects by itself within seconds).
      const active = await this.call(target, 'GET', `/rest/ppp/active?name=${name}`);
      if (Array.isArray(active.body)) {
        for (const session of active.body as Array<{ '.id'?: string }>) {
          if (session['.id'])
            await this.call(target, 'DELETE', `/rest/ppp/active/${session['.id']}`);
        }
      }
    }
    return { created: false };
  }

  async listSecrets(target: RouterTarget): Promise<RouterSecretInfo[]> {
    const res = await this.call(target, 'GET', '/rest/ppp/secret');
    if (!Array.isArray(res.body)) return [];
    return (res.body as Array<{ name?: string; profile?: string; disabled?: string | boolean }>)
      .filter((row) => row.name)
      .map((row) => ({
        name: row.name as string,
        profile: row.profile ?? null,
        disabled: row.disabled === true || row.disabled === 'true',
      }));
  }

  async listSessions(target: RouterTarget): Promise<LiveSession[]> {
    const res = await this.call(target, 'GET', '/rest/ppp/active');
    if (!Array.isArray(res.body)) return [];
    const counters = await this.sessionCounters(target);
    return (
      res.body as Array<{
        name?: string;
        address?: string;
        'caller-id'?: string;
        uptime?: string;
        service?: string;
      }>
    )
      .filter((row) => row.name && (!row.service || row.service === 'pppoe'))
      .map((row) => {
        const c = counters.get(row.name as string);
        return {
          name: row.name as string,
          address: row.address ?? null,
          callerId: row['caller-id'] ?? null,
          uptime: row.uptime ?? null,
          rxBytes: c?.rx ?? null,
          txBytes: c?.tx ?? null,
        };
      });
  }

  /** Byte counters per PPPoE login from the dynamic "<pppoe-USER>" interfaces. Optional: failure means no usage data. */
  private async sessionCounters(
    target: RouterTarget,
  ): Promise<Map<string, { rx: number; tx: number }>> {
    const result = new Map<string, { rx: number; tx: number }>();
    try {
      const res = await this.call(target, 'GET', '/rest/interface?type=pppoe-in');
      if (!Array.isArray(res.body)) return result;
      for (const row of res.body as Array<Record<string, string | undefined>>) {
        const match = /^<pppoe-(.+)>$/.exec(row['name'] ?? '');
        const rx = Number(row['rx-byte']);
        const tx = Number(row['tx-byte']);
        if (match?.[1] && Number.isFinite(rx) && Number.isFinite(tx)) {
          result.set(match[1], { rx, tx });
        }
      }
    } catch {
      /* usage is a bonus; line monitoring must keep working */
    }
    return result;
  }

  async pingFrom(target: RouterTarget, address: string, count: number): Promise<PingResult> {
    const res = await this.call(target, 'POST', '/rest/ping', { address, count: String(count) });
    const rows = Array.isArray(res.body) ? (res.body as Array<Record<string, string>>) : [];
    // RouterOS streams one row per packet; the last row also carries the running totals.
    const last = rows[rows.length - 1] ?? {};
    const sent = Number(last['sent'] ?? rows.length);
    const received = Number(
      last['received'] ?? rows.filter((r) => r['time'] || r['avg-rtt']).length,
    );
    const avg = parseMs(last['avg-rtt']);
    const lossPercent =
      Number.isFinite(sent) && sent > 0 ? Math.round(((sent - received) / sent) * 100) : 100;
    return { sent, received, lossPercent, avgMs: received > 0 ? avg : null };
  }

  async kickSession(target: RouterTarget, pppoeUsername: string): Promise<number> {
    const name = encodeURIComponent(pppoeUsername);
    const active = await this.call(target, 'GET', `/rest/ppp/active?name=${name}`);
    let dropped = 0;
    if (Array.isArray(active.body)) {
      for (const session of active.body as Array<{ '.id'?: string }>) {
        if (!session['.id']) continue;
        await this.call(target, 'DELETE', `/rest/ppp/active/${session['.id']}`);
        dropped += 1;
      }
    }
    return dropped;
  }

  async liveRate(target: RouterTarget, pppoeUsername: string): Promise<LiveRate | null> {
    const active = await this.call(
      target,
      'GET',
      `/rest/ppp/active?name=${encodeURIComponent(pppoeUsername)}`,
    );
    if (!Array.isArray(active.body) || active.body.length === 0) return null;
    const res = await this.call(target, 'POST', '/rest/interface/monitor-traffic', {
      interface: `<pppoe-${pppoeUsername}>`,
      once: '',
    });
    const row = (Array.isArray(res.body) ? res.body[0] : res.body) as
      Record<string, string> | undefined;
    const rx = Number(row?.['rx-bits-per-second']);
    const tx = Number(row?.['tx-bits-per-second']);
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) return null;
    return { rxBps: rx, txBps: tx };
  }

  async getMacLock(target: RouterTarget, pppoeUsername: string): Promise<string | null> {
    const secret = await this.findSecret(target, pppoeUsername);
    return secret['caller-id'] ? secret['caller-id'] : null;
  }

  async setMacLock(target: RouterTarget, pppoeUsername: string, mac: string | null): Promise<void> {
    const secret = await this.findSecret(target, pppoeUsername);
    await this.call(target, 'PATCH', `/rest/ppp/secret/${secret['.id']}`, {
      'caller-id': mac ?? '',
    });
  }

  private async findSecret(
    target: RouterTarget,
    pppoeUsername: string,
  ): Promise<{ '.id': string; 'caller-id'?: string }> {
    const res = await this.call(
      target,
      'GET',
      `/rest/ppp/secret?name=${encodeURIComponent(pppoeUsername)}`,
    );
    const secret = Array.isArray(res.body)
      ? (res.body[0] as { '.id'?: string; 'caller-id'?: string } | undefined)
      : undefined;
    if (!secret?.['.id']) {
      throw new RouterError(
        'SECRET_NOT_FOUND',
        `PPPoE user "${pppoeUsername}" does not exist on this router`,
        false,
      );
    }
    return secret as { '.id': string; 'caller-id'?: string };
  }

  async ping(target: RouterTarget): Promise<{ identity: string; version: string }> {
    const res = await this.call(target, 'GET', '/rest/system/resource');
    const info = (res.body ?? {}) as { version?: string; 'board-name'?: string };
    return { identity: info['board-name'] ?? 'RouterOS', version: info.version ?? 'unknown' };
  }

  private call(
    target: RouterTarget,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    payload?: unknown,
  ): Promise<RouterResponse> {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const auth = Buffer.from(`${target.username}:${target.password}`).toString('base64');
    const transport = target.useTls ? https : http;

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          host: target.host,
          port: target.port,
          path,
          method,
          timeout: TIMEOUT_MS,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            ...(body
              ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
              : {}),
          },
          ...(target.useTls ? { rejectUnauthorized: !target.allowSelfSigned } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed: unknown = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch {
              parsed = null;
            }
            const status = res.statusCode ?? 0;
            if (status === 401 || status === 403) {
              return reject(
                new RouterError('AUTH_FAILED', 'Router rejected the username or password', true),
              );
            }
            if (status >= 400) {
              const detail = (parsed as { detail?: string } | null)?.detail ?? `HTTP ${status}`;
              return reject(
                new RouterError('ROUTER_ERROR', `Router error: ${detail}`, status >= 500),
              );
            }
            resolve({ status, body: parsed });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (error: NodeJS.ErrnoException) => {
        const reason =
          error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error.code === 'SELF_SIGNED_CERT_IN_CHAIN'
            ? 'Router certificate is not trusted (enable "allow self-signed" for this router)'
            : `Cannot reach the router (${error.code ?? error.message})`;
        reject(new RouterError('UNREACHABLE', reason, true));
      });
      if (body) req.write(body);
      req.end();
    });
  }
}

/** RouterOS times look like "12ms" or "1ms500us"; returns milliseconds or null. */
function parseMs(text: string | undefined): number | null {
  if (!text) return null;
  const ms = /(\d+)ms/.exec(text)?.[1];
  const us = /(\d+)us/.exec(text)?.[1];
  if (!ms && !us) return null;
  return Number(ms ?? 0) + Number(us ?? 0) / 1000;
}
