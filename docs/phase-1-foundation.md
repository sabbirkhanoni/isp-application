# Phase 1 — Foundation (done)

Delivered: monorepo, shared contracts, API skeleton (config, logging, request-id, error contract, rate limit,
origin guard, health), DB schema 0001 (users, sessions, audit_logs append-only, system_settings),
authentication (opaque DB sessions, Argon2id, lockout, forced password change), deny-by-default RBAC (ADMIN/STAFF),
audit log, user management (admin), bilingual (bn default / en) web shell with Admin and Staff layouts,
CI, nightly encrypted backup, Render blueprint.

Verified: typecheck, ESLint, 31 API tests (incl. RBAC, lockout, session revocation, audit rows), 5 web tests,
production build boots, real-browser smoke (login → forced password change → create user → language switch).

Not yet verified on real infrastructure: Render/Supabase/Cloudflare deploy (accounts pending), `prisma migrate deploy`
(sandbox blocks Prisma engine download; migration SQL itself is applied and tested on PostgreSQL 16).
