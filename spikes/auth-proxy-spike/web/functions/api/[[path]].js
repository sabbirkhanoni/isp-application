// Cloudflare Pages Function: proxies /api/* to the backend so the browser sees ONE origin.
// Env (Pages dashboard): BACKEND_ORIGIN (e.g. https://isp-api.onrender.com), PROXY_SECRET.
export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.BACKEND_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-proxy-secret', env.PROXY_SECRET ?? '');
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
    ...(hasBody ? { duplex: 'half' } : {}),
  });
  // Response (including Set-Cookie) is returned untouched, so the cookie belongs to the Pages origin.
  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
