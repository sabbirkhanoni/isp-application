# ADR-004 — Session strategy and same-origin API proxy

Status: **PROPOSED — decided by spike S4**
Date: 2026-11-09

## Context

The frontend (Cloudflare Pages, `*.pages.dev`) and backend (Render, `*.onrender.com`) are different sites. Cross-site cookies are increasingly blocked by browsers, especially on mobile, which would break login for Field Staff.

## Decision (provisional)

- Server-side **opaque sessions** stored in the database (not JWT): instantly revocable when a staff account is disabled.
- Cookie `__Host-sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`.
- A Cloudflare Pages Function at `/api/*` proxies to the Render backend so the browser only ever talks to one origin. The backend trusts the proxy only for forwarded client IP (rate limiting), via a shared secret header.

## Spike S4 passes when

Login, refresh and logout work in Chrome Android, Safari iOS and desktop Chrome/Firefox with third-party cookies blocked.

## Fallback

If the proxy proves unreliable or hits the Function quota (ADR-003 #7), use a custom domain with subdomains of the same registrable domain (small cost) or bearer tokens held in memory with a rotating refresh cookie.

## Update (Phase 7)

`PROXY_SECRET` is enforced in `shared/middleware/client-ip.ts`: `req.ip` is replaced by the first `X-Forwarded-For` entry only when `x-proxy-secret` matches. Set the same value on Render and in the Pages project.
