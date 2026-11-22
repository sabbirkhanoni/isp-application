# Phase 7 — Hardening, performance, deployment

## Changes

- **Client IP trust (ADR-004)**: `PROXY_SECRET` is now enforced. The Pages Function sends the visitor IP plus the secret; the API only trusts the forwarded IP when the secret matches (timing-safe). Without it, rate limits and audit logs would see Cloudflare's IP.
- **Body limits**: global JSON limit stays 100 kb; only authenticated bKash and customer import routes accept up to 3 MB (previously the bKash parser ran before authentication).
- **Customer import** (`/customers/import`, admin): CSV with check-first/all-or-nothing commit, keeps existing Customer IDs, advances the ID counter, sends no SMS and creates no router jobs.
- **bKash import in slices**: 100 rows per request (`offset` / `nextOffset`); the page loops and sums. Re-sending the file is safe (duplicates by TrxID).
- **Migration runner** (`node dist/migrate.js`): advisory lock, checksum ledger, one transaction per migration. Render free has no pre-deploy command, so it runs in `startCommand` before the server.
- **Static headers** (`apps/web/public/_headers`): CSP, frame denial, nosniff, HSTS, referrer and permissions policies.

## Measured (2,500 customers, 11 months history, local DB)

Dashboard summary 42 ms · dues page 17 ms · dues CSV 21 ms · collections CSV 5 ms · customer search 26 ms · invoice list 25 ms · generate 2,500 bills 4.6 s (re-run 6 ms) · bKash import 1.4 s per 100–150 rows. Run with `PERF=1 npx vitest run test/perf`.

## Verified

- Fresh database migrates (5 applied, then 0); dump → restore round-trip keeps all tables and the ledger.
- `npm audit --omit=dev`: 2 moderate advisories in react-router (open redirect in `<Link>` with attacker-controlled targets; SSR hydration issue). The app uses neither (no user-supplied link targets, no SSR). Fix needs a major upgrade to v7; planned as a separate, tested change.
- No secrets in source (scan of keys/passwords).

## Known limits

Existing PPPoE secrets only are toggled (none are created); RouterOS REST calls are tested against a mock; bKash CSV column names are matched by aliases and need one real file to confirm; SMS defaults to log-only; opening balances are not part of customer import.
