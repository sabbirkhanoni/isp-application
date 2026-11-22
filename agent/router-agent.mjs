#!/usr/bin/env node
/**
 * Router agent — runs INSIDE the ISP network (a PC, Raspberry Pi or mini server), next to the MikroTik.
 * It only makes outbound HTTPS calls: it asks the billing server "any work for my router?", applies the
 * change to the router over the LAN, and reports the result. No inbound port or public router IP needed.
 *
 * Needs Node 18+ and no packages.   Usage:  node router-agent.mjs     (settings come from environment)
 *   BACKEND_URL   e.g. https://your-api.onrender.com
 *   AGENT_TOKEN   shown once when you add the router (driver "Agent") in the admin screen
 *   ROUTER_URL    e.g. https://192.168.88.1      (RouterOS www-ssl service; or http:// with www)
 *   ROUTER_USER / ROUTER_PASSWORD   a RouterOS user with write access to ppp
 *   ALLOW_SELF_SIGNED=true          when the router uses its own certificate
 *   POLL_SECONDS=30
 * It also reports who is online (PPPoE sessions) about once a minute, for the Lines screen.
 */
import https from 'node:https';
import http from 'node:http';

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    console.error(`Missing setting ${name}`);
    process.exit(1);
  }
  return value;
};

const BACKEND_URL = env('BACKEND_URL').replace(/\/$/, '');
const AGENT_TOKEN = env('AGENT_TOKEN');
const ROUTER_URL = new URL(env('ROUTER_URL'));
const ROUTER_AUTH = Buffer.from(`${env('ROUTER_USER')}:${env('ROUTER_PASSWORD')}`).toString(
  'base64',
);
const ALLOW_SELF_SIGNED = env('ALLOW_SELF_SIGNED', 'false') === 'true';
const POLL_MS = Number(env('POLL_SECONDS', '30')) * 1000;

class NotFound extends Error {}

function routerCall(method, path, payload) {
  const transport = ROUTER_URL.protocol === 'https:' ? https : http;
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        host: ROUTER_URL.hostname,
        port: ROUTER_URL.port || (ROUTER_URL.protocol === 'https:' ? 443 : 80),
        path,
        method,
        timeout: 15000,
        rejectUnauthorized: !ALLOW_SELF_SIGNED,
        headers: {
          Authorization: `Basic ${ROUTER_AUTH}`,
          Accept: 'application/json',
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400)
            return reject(new Error(`Router answered HTTP ${res.statusCode}`));
          resolve(text ? JSON.parse(text) : null);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Router timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function dropSessions(name) {
  const active = await routerCall('GET', `/rest/ppp/active?name=${name}`);
  for (const session of Array.isArray(active) ? active : []) {
    if (session['.id']) await routerCall('DELETE', `/rest/ppp/active/${session['.id']}`);
  }
}

/** Returns true when the account had to be created. */
async function applyJob({ pppoeUsername, desiredState, profile, password }) {
  const name = encodeURIComponent(pppoeUsername);
  const enabled = desiredState === 'ENABLED';
  const secrets = await routerCall('GET', `/rest/ppp/secret?name=${name}`);
  const secret = Array.isArray(secrets) ? secrets[0] : undefined;

  if (!secret?.['.id']) {
    if (!password) throw new NotFound(`PPPoE user "${pppoeUsername}" does not exist on the router`);
    await routerCall('PUT', '/rest/ppp/secret', {
      name: pppoeUsername,
      password,
      service: 'pppoe',
      disabled: enabled ? 'false' : 'true',
      ...(profile ? { profile } : {}),
    });
    return true;
  }

  const profileChanged = Boolean(profile) && secret.profile !== profile;
  await routerCall('PATCH', `/rest/ppp/secret/${secret['.id']}`, {
    disabled: enabled ? 'false' : 'true',
    ...(profileChanged ? { profile } : {}),
  });
  if (!enabled || profileChanged) await dropSessions(name);
  return false;
}

async function backend(path, payload) {
  const res = await fetch(`${BACKEND_URL}/api/v1/agent${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Server answered HTTP ${res.status}`);
  return (await res.json()).data;
}

let lastSessionReport = 0;
let lastSecretsReport = 0;
async function reportSessions() {
  if (Date.now() - lastSessionReport < 55000) return;
  const active = await routerCall('GET', '/rest/ppp/active');
  // Byte counters live on the per-session interface "<pppoe-USERNAME>"; optional, usage is skipped if unreadable.
  const counters = new Map();
  try {
    const ifaces = await routerCall('GET', '/rest/interface?type=pppoe-in');
    for (const row of Array.isArray(ifaces) ? ifaces : []) {
      const match = /^<pppoe-(.+)>$/.exec(row.name ?? '');
      if (match) counters.set(match[1], row);
    }
  } catch {
    /* ignore */
  }
  const sessions = (Array.isArray(active) ? active : [])
    .filter((row) => row.name && (!row.service || row.service === 'pppoe'))
    .map((row) => {
      const c = counters.get(row.name);
      return {
        name: row.name,
        address: row.address,
        callerId: row['caller-id'],
        uptime: row.uptime,
        // On the router, rx = received from the customer (upload), tx = sent to the customer (download).
        ...(c ? { rxBytes: Number(c['rx-byte']), txBytes: Number(c['tx-byte']) } : {}),
      };
    });
  // The full account list is large, so it is sent only every 10 minutes (for the Compare screen).
  let secrets;
  if (Date.now() - lastSecretsReport > 600000) {
    const rows = await routerCall('GET', '/rest/ppp/secret');
    secrets = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.name)
      .map((row) => ({
        name: row.name,
        profile: row.profile,
        disabled: row.disabled === true || row.disabled === 'true',
      }));
  }
  await backend('/sessions', { sessions, ...(secrets ? { secrets } : {}) });
  lastSessionReport = Date.now();
  if (secrets) lastSecretsReport = Date.now();
}

async function cycle() {
  await reportSessions().catch((error) =>
    console.error(new Date().toISOString(), 'session report failed:', error.message),
  );
  const jobs = await backend('/claim');
  for (const job of jobs) {
    try {
      const secretCreated = await applyJob(job);
      await backend(`/jobs/${job.id}/result`, { ok: true, secretCreated });
      console.log(new Date().toISOString(), 'done', job.pppoeUsername, job.desiredState);
    } catch (error) {
      const retryable = !(error instanceof NotFound);
      console.error(new Date().toISOString(), 'failed', job.pppoeUsername, error.message);
      await backend(`/jobs/${job.id}/result`, {
        ok: false,
        error: error.message.slice(0, 280),
        retryable,
      }).catch(() => {});
    }
  }
}

console.log('Router agent started; polling every', POLL_MS / 1000, 'seconds');
for (;;) {
  try {
    await cycle();
  } catch (error) {
    console.error(new Date().toISOString(), 'cycle error:', error.message);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
