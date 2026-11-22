# Spike S4 — Same-origin cookie login via Cloudflare Pages proxy

Goal: confirm HttpOnly session cookies work on real phones when `/api/*` is proxied by a Pages Function (ADR-004).

## Deploy

1. **Backend:** deploy `backend/` as a free Render Web Service (`node server.mjs`). Set `PROXY_SECRET` to a random string.
2. **Frontend:** deploy `web/` as a Cloudflare Pages project (no build command, output dir `/`). Set env vars `BACKEND_ORIGIN` (Render URL) and `PROXY_SECRET` (same value).

## Test matrix (record in `docs/phase-0/spike-results.md`)

| Browser                                          | Login | Survives reload | Logout clears | Notes |
| ------------------------------------------------ | ----- | --------------- | ------------- | ----- |
| Chrome Android (cookies for 3rd parties blocked) |       |                 |               |       |
| Safari iOS                                       |       |                 |               |       |
| Chrome desktop                                   |       |                 |               |       |
| Firefox desktop                                  |       |                 |               |       |

Also record: first-request time after the backend has slept (cold start), and the daily Function request count in the Cloudflare dashboard.

## Pass condition

All rows pass with third-party cookies blocked. Anything else: see ADR-004 fallback.
