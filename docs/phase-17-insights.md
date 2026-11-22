# Phase 17 — Collectors, usage and charts

## 1. Collectors and targets (Reports → Collectors & targets)

- A **collector** is the staff member responsible for a group of customers (usually an area). This is different from the older "who typed the payment" report.
- Admin gives customers to a collector by **area** or by a pasted list of **customer IDs**; "Remove assignment" clears it.
- For each month the table shows customers, billed, collected, still unpaid, and progress against the **monthly target** (type taka and Save; 0 removes the target). Customers without a collector appear as one "No collector assigned" row.
- "Collected" counts payments from the collector's customers, whoever recorded them. "Unpaid now" is all unpaid bills of those customers, any month.
- Every staff member sees "My collection this month" on their dashboard. Assigning and targets are admin-only and are in the activity log.

## 2. Internet usage (customer page + Network → Internet usage)

- Every minute the router's PPPoE interface byte counters are read and only the **growth since the previous check** is added to that day's total (per login, Dhaka dates).
- A new session (counters went down, or the login was offline before) counts from zero; a login seen for the very first time counts nothing, so old traffic is never wrongly attributed.
- Customer page: last 6 months (↓ download, ↑ upload). Usage page: top 50 users of a month. Data older than 13 months is deleted automatically to stay inside the free database.
- Works with direct (REST) routers and with the agent. **The agent file changed: replace it on the router-side computer** (adds byte counters; old agents still work, just without usage).
- Not measured: traffic while the server was asleep or the router unreachable, and non-PPPoE customers.
- **Unconfirmed:** the counters come from `/rest/interface?type=pppoe-in` (interface names `<pppoe-USER>`). Verified against mocks only. Check on one real router: if the usage page stays empty after 10 minutes, tell me the output of that URL.

## 3. Dashboard chart

Last 12 months: billed (grey, with the still-unpaid part in amber) next to collected (green). Hover a bar for the numbers. Drawn with plain CSS, no chart library.

## Migration

`0012_collectors_usage` (customers.collector_id, collection_targets, usage_daily, line_status counters).

## Tests

`test/collectors-usage.test.ts`, `format.test.ts`.
