# ISP Billing & Management System

Monorepo (npm workspaces):

| Path                 | What                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `apps/api`           | Express + TypeScript + Prisma (modular monolith)                   |
| `apps/web`           | React + Vite + Tailwind (Admin desktop UI, Staff mobile UI, bn/en) |
| `packages/contracts` | Shared Zod schemas, DTO types, permissions, error codes            |
| `docs`               | Business rules, ADRs, phase notes                                  |
| `spikes`             | Phase 0 throw-away experiments (router, auth proxy)                |

## Run locally

Requirements: Node 22, PostgreSQL 16.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # edit DATABASE_URL etc.
npm run build:contracts
npm run db:migrate:deploy -w @isp/api        # applies prisma/migrations
npm run db:seed -w @isp/api                  # creates the first admin (password change forced)
npm run dev -w @isp/api                      # http://localhost:4000
npm run dev -w @isp/web                      # http://localhost:5173 (proxies /api to the API)
```

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

API tests need a Postgres at `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/isp_test`); the test database is created automatically.

## Deploy (all free tiers)

- **Supabase**: create a project; copy the pooled connection string to `DATABASE_URL` and the direct one to `DIRECT_URL`.
- **Render**: New → Blueprint → select this repo (`render.yaml`). Set `DATABASE_URL`, `DIRECT_URL`, `ALLOWED_ORIGINS` (your Pages URL). Run `npm run db:seed -w @isp/api` once from the Render shell or locally against the production DB.
- **Cloudflare Pages**: root `apps/web`, build `npm ci && npm run build:contracts && npm run build -w @isp/web` (run from repo root), output `apps/web/dist`. Set `BACKEND_ORIGIN` to the Render URL; `functions/api/[[path]].js` proxies `/api/*` so cookies stay same-origin.
- **UptimeRobot**: monitor `https://<render-url>/health` every 5 min (keeps the free API awake).
- **Backups**: add repo secrets `BACKUP_DATABASE_URL` and `BACKUP_AGE_PUBLIC_KEY`; `.github/workflows/backup.yml` stores an encrypted nightly dump.

**Step-by-step Bangla guide:** `docs/deploy-guide.bn.md` (includes the go-live checklist). Set `PROXY_SECRET` on both Render and Cloudflare Pages. Migrations run automatically before the API starts.

Existing customers can be loaded from CSV (Customers → Import). Phase notes: `docs/phase-*.md` (4 bKash, 5 network/router, 6 reports, 7 hardening, 8 live line monitoring, 9 router management and OLT/ONU, 12 business accounts, 13 admin tools and phone app, 14 safety before go-live, 15 billing extras, 16 automation, 17 collectors/usage/charts; see also `docs/go-live-checklist.bn.md`). See `docs/` for business rules and architecture decisions.
