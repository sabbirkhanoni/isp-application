# Spike S1 — Router reachability

Goal: learn whether the free Render backend can reach a MikroTik RouterOS v7 REST API (ADR-001).

## On the router (use a test router or a read-only user)

1. Create a group with only `read`, `api`, `rest-api` policies and a user in it (e.g. `isp-spike-ro`).
2. Enable `www-ssl` with a certificate (`/ip service`). Do not enable plain `www`.
3. Restrict `www-ssl` with `address=` to the source you test from, if you can.

## Local check (from a PC on the ISP network)

```bash
ROUTER_URL=https://192.168.88.1 ROUTER_USER=isp-spike-ro ROUTER_PASS=... \
ROUTER_CA_PEM="$(cat router-ca.pem)" SPIKE_TOKEN=local node server.mjs
curl -H 'x-spike-token: local' http://localhost:3000/spike/report
```

## From Render (the real question)

1. Deploy this folder as a free Web Service (`node server.mjs`), set the env vars above, set `SPIKE_TOKEN` to a long random value.
2. `curl -H 'x-spike-token: <token>' https://<service>.onrender.com/spike/report`
3. Record in `docs/phase-0/spike-results.md`: status per path, latency (`ms`), error codes (`ECONNREFUSED`, `ETIMEDOUT`, TLS errors).

## Reading the result

| Result                       | Meaning                                                            | Decision                                                                                   |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| all `ok: true`               | router reachable and REST works                                    | option A is possible; still weigh exposure risk                                            |
| `ETIMEDOUT` / `ECONNREFUSED` | router not reachable from internet (private IP, CGNAT or firewall) | option B (Router Agent)                                                                    |
| TLS error                    | certificate problem                                                | install a trusted/pinned CA; never use `ROUTER_TLS_STRICT=false` outside a throw-away test |

Delete the Render service and rotate the router password when finished.
