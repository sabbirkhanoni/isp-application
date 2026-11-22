# Phase 0 — Discovery & Feasibility

Exit gate: ADR-001…006 decided, `business-rules.md` signed off, router driver and payment source chosen.

## Status

| Item                                          | State                                                      |
| --------------------------------------------- | ---------------------------------------------------------- |
| Business rules draft (`../business-rules.md`) | Done — awaiting owner confirmation                         |
| ADR-003 hosting limits                        | Accepted (verified 2026-11-09)                             |
| ADR-005 existing Customer IDs                 | Accepted                                                   |
| ADR-006 SMS                                   | Proposed — needs channel choice                            |
| ADR-001 router driver                         | Proposed — needs spike S1                                  |
| ADR-002 payment source                        | Proposed — needs bKash answers (S2)                        |
| ADR-004 session/proxy                         | Proposed — needs spike S4                                  |
| Spike code                                    | S1 and S4 ready in `/spikes`; tested locally against mocks |

## What we need from the owner

1. **Accounts (free):** GitHub, Cloudflare, Render, Supabase, UptimeRobot.
2. **Router test:** a test router (or a read-only user on a live one) plus the RouterOS version, model, and whether it has a public IP or sits behind CGNAT. Run spike S1.
3. **bKash:** send `bkash-merchant-questionnaire.md`; paste the answers back.
4. **Data:** 10–20 sample existing Customer IDs; a customer export using `data-inventory-template.csv` (a few dozen rows is enough for now); package list with prices.
5. **SMS:** choose channel A (paid gateway) or B (Android phone with ISP SIM), see ADR-006.
6. **Confirm** the defaults in `business-rules.md`, especially OI-02 (mid-month joiners).
7. **Always-on device:** does the ISP office have a PC/Raspberry Pi that stays on? (needed if option B for the router).

## Spike results log

Create `spike-results.md` and record outcomes there when spikes run.
