# Phase 8 — Live line monitoring

## What it does

Shows whether each customer's PPPoE line is online right now, with IP, how long it has been up and when it was last seen.

- **Direct (REST) routers**: the API reads `/rest/ppp/active` every 60 s (background job, one failing router never blocks the others).
- **Agent routers**: the router agent posts the same list to `POST /api/v1/agent/sessions` about once a minute.
- Results are stored in `line_status` (one row per router + PPPoE login; migration 0006). A login the router no longer lists becomes OFFLINE and keeps its "last online" time. A login never listed is NOT_SEEN.
- If a router cannot be reached, the last known state is kept and flagged "old data"; the error shows on the Routers screen.
- Works with `ROUTER_DRY_RUN=true`: reading is harmless, only changes are logged.

## Screens

- **Customer lines** (`/network/lines`, staff and admin): counts, filter, search; "active but offline" customers are listed first.
- **Customer page**: line card (state, IP, online for / last online).
- **Routers**: "online now" per router. **Dashboard**: online / offline / active-but-offline.

## API

`GET /network/lines?filter=ALL|ONLINE|OFFLINE|NEVER_SEEN&search=&page=` (meta.summary has the counts) · `GET /network/lines/customer/:id` · `POST /agent/sessions`.

## Notes

- REST path `/rest/ppp/active` is tested against a mock; verify on the first real router (fields used: name, address, caller-id, uptime, service).
- Only customers with a router and a PPPoE username are monitored.
- Update the agent (`agent/router-agent.mjs`) on the ISP-side PC to report sessions.
