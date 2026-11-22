# ADR-001 — Router connectivity driver

Status: **PROPOSED — decided by spike S1**
Date: 2026-11-09

## Context

The backend runs on Render's free web service, which (per Render's docs, checked 2026-11-09) **cannot receive private network traffic**, restarts at any time and has no free background worker. MikroTik RouterOS v7 exposes a REST API at `https://<router>/rest/<menu>` using HTTP Basic auth on every request; it needs the `www-ssl` service with a certificate, and a request longer than 60 s fails with `Session closed` (MikroTik REST docs). Whether our routers are reachable from the public internet (public IP vs CGNAT/private) is unknown.

## Options

|       | A. Direct REST                                                                                               | B. Router Agent (pull)                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| How   | Backend calls router `www-ssl` over the internet                                                             | A small always-on program inside the ISP network polls the backend over HTTPS, runs jobs against the router on the LAN, and posts results |
| Needs | Router reachable from internet; valid certificate or pinned CA; firewall allowlist                           | One always-on PC / Raspberry Pi / mini-server at the ISP; outbound HTTPS only                                                             |
| Risk  | Exposes router management port; Render free has no fixed outbound IP to allowlist (to be confirmed in spike) | Extra component to run and monitor; job latency = poll interval                                                                           |
| Cost  | none                                                                                                         | none if a device already exists                                                                                                           |

## Decision (provisional)

Implement a `RouterGateway` interface in the backend. Both drivers implement it, so service and job-handler code is identical. Run spike S1 (`spikes/router-spike`) to test option A. **If the router is not reachable or the exposure is unacceptable, option B is used.** Until the spike result arrives, Phases 1–4 proceed unaffected.

## Consequences

- Router credentials never leave the backend (A) or the ISP network (B).
- Under B, `network_jobs` rows are claimed by the agent with a per-router token; results are verified by a follow-up read.
- RouterOS REST paths for `ppp/secret` are not in the official page; they follow the menu-to-URL rule and **must be verified on the real test router** before use.
