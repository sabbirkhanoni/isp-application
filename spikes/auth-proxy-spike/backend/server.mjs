// Spike S4 — HttpOnly cookie login through a same-origin Cloudflare Pages Function proxy.
// In-memory sessions, throw-away, zero dependencies (Node 20+).
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4000);
const PROXY_SECRET = process.env.PROXY_SECRET ?? ''; // shared with the Pages Function
const COOKIE = '__Host-sid';
const sessions = new Map();

const parseCookies = (header = '') =>
  Object.fromEntries(
    header
      .split(';')
      .map((p) => p.trim().split('='))
      .filter(([k]) => k),
  );

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    if (req.url === '/health') return send(res, 200, { status: 'ok' });
    if (PROXY_SECRET && req.headers['x-proxy-secret'] !== PROXY_SECRET) {
      return send(res, 403, { error: 'FORBIDDEN' });
    }
    const sid = parseCookies(req.headers.cookie)[COOKIE];

    if (req.method === 'POST' && req.url === '/api/login') {
      const id = randomBytes(24).toString('hex');
      sessions.set(id, { user: 'admin', createdAt: Date.now() });
      return send(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': `${COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
        },
      );
    }
    if (req.method === 'GET' && req.url === '/api/me') {
      const s = sid && sessions.get(sid);
      return s
        ? send(res, 200, { user: s.user, clientIp: req.headers['x-forwarded-for'] ?? null })
        : send(res, 401, { error: 'UNAUTHENTICATED' });
    }
    if (req.method === 'POST' && req.url === '/api/logout') {
      if (sid) sessions.delete(sid);
      return send(
        res,
        200,
        { ok: true },
        {
          'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
        },
      );
    }
    return send(res, 404, { error: 'NOT_FOUND' });
  })
  .listen(PORT, () => console.log(`auth-spike backend on ${PORT}`));
