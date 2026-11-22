// Spike S1 — can a Render free service reach the MikroTik RouterOS v7 REST API?
// READ-ONLY and throw-away: no writes, fixed allowlist of GET paths, token protected.
// Delete this service after the spike. Zero dependencies (Node 20+).
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.env.PORT ?? 3000);
const ROUTER_URL = process.env.ROUTER_URL; // e.g. https://203.0.113.10
const ROUTER_USER = process.env.ROUTER_USER;
const ROUTER_PASS = process.env.ROUTER_PASS;
const ROUTER_CA_PEM = process.env.ROUTER_CA_PEM; // PEM text of the router's CA/cert (preferred)
const TLS_STRICT = process.env.ROUTER_TLS_STRICT !== 'false';
const SPIKE_TOKEN = process.env.SPIKE_TOKEN;
const TIMEOUT_MS = 15_000;

const ALLOWED_PATHS = [
  '/rest/system/resource?.proplist=board-name,version,uptime,cpu-load',
  '/rest/ppp/profile?.proplist=name,rate-limit',
  '/rest/ppp/active?.proplist=name,address',
];

function requestRouter(pathAndQuery) {
  return new Promise((resolve) => {
    const started = Date.now();
    const url = new URL(pathAndQuery, ROUTER_URL);
    const client = url.protocol === 'https:' ? https : http;
    const options = {
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${ROUTER_USER}:${ROUTER_PASS}`).toString('base64'),
        Accept: 'application/json',
      },
      ...(url.protocol === 'https:' ? { ca: ROUTER_CA_PEM, rejectUnauthorized: TLS_STRICT } : {}),
    };
    const req = client.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 200);
        }
        resolve({
          path: pathAndQuery.split('?')[0],
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          ms: Date.now() - started,
          itemCount: Array.isArray(body) ? body.length : undefined,
          sample: Array.isArray(body) ? body.slice(0, 2) : body,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) =>
      resolve({
        path: pathAndQuery.split('?')[0],
        ok: false,
        ms: Date.now() - started,
        error: err.code ?? err.message,
      }),
    );
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body, null, 2));
  };
  if (req.method === 'GET' && req.url === '/health')
    return json(200, { status: 'ok', t: new Date().toISOString() });
  if (req.method === 'GET' && req.url === '/spike/report') {
    if (!SPIKE_TOKEN || req.headers['x-spike-token'] !== SPIKE_TOKEN)
      return json(401, { error: 'UNAUTHENTICATED' });
    if (!ROUTER_URL || !ROUTER_USER || !ROUTER_PASS)
      return json(500, { error: 'ROUTER_* env not set' });
    const results = [];
    for (const p of ALLOWED_PATHS) results.push(await requestRouter(p));
    return json(200, { routerUrl: new URL(ROUTER_URL).origin, tlsStrict: TLS_STRICT, results });
  }
  return json(404, { error: 'NOT_FOUND' });
});

server.listen(PORT, () => console.log(`router-spike listening on ${PORT}`));
