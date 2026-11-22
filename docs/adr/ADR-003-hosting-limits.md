# ADR-003 — Free-tier hosting limits and consequences

Status: **ACCEPTED (limits verified 2026-11-09 from official pages; re-verify before go-live)**

## Verified facts

| Service                 | Fact                                                                                                                                                                 | Source                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Render Free web service | Spins down after 15 min without inbound traffic; wake takes about 1 min                                                                                              | https://render.com/docs/free                              |
|                         | 750 free instance hours per month; when exhausted, free services are suspended until next month                                                                      | same                                                      |
|                         | No free background worker; no persistent disk; local files lost on restart/redeploy; may restart at any time                                                         | same                                                      |
|                         | Outbound ports 25, 465 and 587 are blocked (no direct SMTP); cannot receive private network traffic                                                                  | same                                                      |
|                         | Keep-alive pings are not addressed in the docs                                                                                                                       | same                                                      |
| Supabase Free           | 500 MB database, 2 active projects, paused after 1 week of inactivity, **no automatic backups**, 5 GB egress/month                                                   | https://supabase.com/pricing                              |
| Cloudflare Pages        | Static asset requests free and unlimited; Pages Functions count against the Workers Free daily quota (100,000 requests/day in the docs' example, reset at 00:00 UTC) | https://developers.cloudflare.com/pages/functions/pricing |

## Consequences

1. **Hours budget:** a 31-day month is 744 hours; one always-awake service uses nearly all of the 750 free hours. Only **one** Render service can run 24/7, so there is no room for a second service or a worker.
2. **Sleep:** if pings do not keep the service awake, the first request takes about a minute. The UI shows a "server is waking up" screen; the scheduler is catch-up based; jobs live in the database.
3. **Keep-alive risk:** pinging to avoid sleep is not addressed by Render's docs; treat it as best effort and keep paid "always-on" as the documented fallback (a deploy-setting change only).
4. **Backups are our job:** scheduled encrypted `pg_dump` (GitHub Actions) stored outside Supabase; restore drill before go-live.
5. **Two Supabase projects** are the maximum: one dev, one prod, with nothing spare. Local Docker Postgres is used for tests.
6. **No SMTP:** any email must use an HTTPS API; SMS goes through an HTTP gateway or the Android-phone path (ADR-006).
7. **Function quota:** every `/api/*` call through the Pages proxy consumes the daily Function quota; keep-alive and monitor pings go **directly** to the backend, not through the proxy.
8. **Scale check:** 2,500 customers × 12 invoices/year is a few tens of MB per year; 500 MB is sufficient for pilot, with a log/outbox retention policy.
