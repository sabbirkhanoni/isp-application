# Phase 2 — Packages, Leads, Customers (done)

Delivered: packages (admin manages, staff read active only), leads (staff submit, admin approves/rejects),
customers + one subscription each, Internet Activation Policy chosen at approval or direct creation (BR-09),
customer search (name / ID / phone / PPPoE username) and status filter, contact editing (admin), bn/en screens.

## Rules implemented

- Customer ID: an existing ID is kept verbatim (unique ignoring case). If none is given, the system generates
  `C00001`, `C00002`, … from a database sequence and skips any ID already taken. Gaps can appear (a failed
  approval consumes a number) — acceptable. The prefix/width are constants in `customer-record.ts`
  until the owner's real ID samples arrive (OI-04).
- Activation policy stored on the subscription. `ACTIVATE_NOW` -> customer `ACTIVE`; `AFTER_FIRST_PAYMENT` and
  `MANUAL` -> `PENDING_ACTIVATION`. The switch-on itself (first payment, router provisioning) arrives in Phases 3-5.
- Lead approval is one DB transaction: claim lead + create customer + link. Any failure leaves the lead `PENDING`.
- PPPoE username is required for PPPoE and unique ignoring case. Other connection types need none (BR-02).
- `subscriptions.router_id` exists but has no FK yet; routers are introduced in Phase 5.
- Staff see all customers (BR-10) but only their own leads; only admin creates/edits customers and packages.

## Verified

46 API tests (incl. rollback on duplicate ID, double-approval, case-insensitive IDs, role limits), 5 web tests,
typecheck, ESLint, production build, and a real-browser run: admin creates package + staff → staff (mobile)
submits a request → admin approves with activation policy → customer detail shows C00001.
