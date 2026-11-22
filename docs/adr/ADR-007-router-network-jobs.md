# ADR-007 — Router changes through a job queue

## Status

Accepted (Phase 5). Builds on ADR-001.

## Decision

- A router change is never made inside the web request. A status change (activate, suspend, first payment, router change) writes a `network_jobs` row **in the same database transaction** (outbox pattern).
- A job means "make the router match this customer's current status". The status is read when the job runs, so a stale job can never apply an old decision, and repeated changes collapse into one waiting job per customer (partial unique index).
- Two drivers behind one idea: **REST** (the server calls RouterOS v7 `/rest` directly, run by the in-process 30-second tick) and **AGENT** (a small program in the ISP network claims jobs with a per-router bearer token and reports back). Routers can be mixed.
- Failures: retryable ones (unreachable, wrong password) retry after 1, 5, 15, 60 minutes, then stop after 5 tries; a missing PPPoE user fails at once. Failed jobs show on the Routers page with a Retry button. A later success clears older failures of that customer.
- Router passwords are encrypted with AES-256-GCM using `ROUTER_SECRET`. They are never returned by the API or written to logs/audit.
- `ROUTER_DRY_RUN=true` swaps the REST driver for a log-only driver for a safe first trial.

## Consequences

- The system **toggles existing PPPoE secrets** (`disabled=yes/no`) and drops the live session when disabling. It does not create secrets, profiles or queues; that stays in your MikroTik setup.
- Only PPPoE customers with an assigned router are managed. DHCP/static/hotspot customers can still be suspended in the system, but the router must be changed by hand.
- The RouterOS REST paths follow the documented menu-to-URL rule and were verified against a mock only. Verify them once on the real router (see docs/phase-5-network.md).
