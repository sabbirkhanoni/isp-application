# New Phase 2 — Live line tools (customer page)

Shown inside the "Line" card on a customer's page. Staff can use ping, speed and restart; only an admin can lock or reset the MAC.

| Tool                                                 | API (under /api/v1/network/lines/customer/:id) | Who                          |
| ---------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| Live speed (Mbps, refreshes every 2.5 s, mini graph) | GET /traffic                                   | CUSTOMER_READ                |
| Ping from the router (4 packets: loss %, avg ms)     | POST /ping                                     | CUSTOMER_READ                |
| Restart session (customer reconnects in seconds)     | POST /kick                                     | CUSTOMER_READ, audited       |
| MAC lock state                                       | GET /mac                                       | CUSTOMER_READ                |
| Lock to current (or typed) MAC                       | POST /mac/lock                                 | ROUTER_CONFIG_WRITE, audited |
| Allow a new router (remove lock)                     | POST /mac/reset                                | ROUTER_CONFIG_WRITE, audited |

MAC lock = the PPP secret's `caller-id`. To change a customer's router: "Allow a new router", let the new one connect, then "Lock".

Limits

- Direct (REST) routers only. Agent-connected routers show a clear message; live tools there need a later agent extension.
- RouterOS REST paths used (`/rest/ping`, `/rest/interface/monitor-traffic`, `/rest/ppp/secret caller-id`) are verified against mocks only; check on the first real router.
- In dry-run mode, ping/speed/MAC-read work for real, restart and MAC changes are only logged.

Tests: test/live-tools.test.ts (7).
