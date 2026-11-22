# Phase 9 — Router and line management

## Create accounts and switch speed from the system

- A router-managed PPPoE customer now keeps an **encrypted PPPoE password** (typed by the admin or generated, 8 characters). If the account does not exist on the router, the sync job **creates it** (service pppoe, the package's router profile, enabled or disabled as the customer's status requires).
- An account that already exists is never touched except for on/off and profile. Its password is never overwritten. When the first job finds the account existed, the stored password is discarded (it never reached the router), so the screen never shows a wrong password.
- The admin can show the stored password on the customer page; every view is written to the audit log.
- **Plan change** (admin): the customer page has "Change package". The router profile switches immediately (the live session is dropped so the new speed applies on reconnect). The new price applies from the **next invoice**; invoices already issued are unchanged.
- A package without a "router profile" value never changes the profile on the router.

## Compare with router (Routers → Compare with router)

Uses a snapshot of the router's PPP accounts (read every 10 minutes by the poller, on demand with "Read router now", or sent by the agent).

- **On the router, not in the system**: list plus a CSV in the customer-import layout (package guessed from the profile, status from on/off). Fill name, phone, address and import.
- **In the system, missing on the router**: can be created by "Fix" when a password is stored.
- **Different profile or on/off state**: "Fix" queues a sync for each.
  Nothing changes until an admin presses Fix.

## OLT / ONU

Optional fields per customer: OLT name, PON port, ONU serial (create form and customer page). Customers can be found by ONU serial in the customer search. They are notes only; the system does not talk to the OLT.

## Other connection types

DHCP, static and hotspot customers are still recorded but not switched on the router (no PPPoE account); suspend them on the router by hand.

## Technical

Migration 0007 (subscriptions: pppoe_password_enc, pppoe_password_verified, olt_name, pon_port, onu_serial; routers.secrets_synced_at; router_secrets). Gateway: `setPppoeEnabled(..., {profile, password})` returns `{created}`, new `listSecrets`. Agent (`agent/router-agent.mjs`) creates accounts, switches profiles, and reports accounts every 10 minutes: replace the agent file on the ISP-side PC. `ROUTER_SECRET` must be set (it is on Render) or accounts cannot be created.
Tests: 12 new API tests (provisioning, compare, ONU) plus 2 gateway tests.
RouterOS REST calls (`PUT /rest/ppp/secret`, profile PATCH) are verified against a mock only; try on one test customer first. If the profile name does not exist on the router, RouterOS rejects it and the job fails with that message.
