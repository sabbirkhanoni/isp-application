# Business Rules — Phase 0 Sign-off Draft

Status: **DRAFT — accepted defaults, awaiting owner confirmation** (answers received 2026-11-09).
Source legend: `OWNER` = stated by the project owner, `DEFAULT` = proposed default the owner told us to proceed with.

| ID    | Rule                                                                                                                                                                                                                                                                  | Source          | Affects |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- |
| BR-01 | Design target: up to **2,500 customers**. Several routers may exist now and more may be added later, so every subscription references a `router_id`.                                                                                                                  | OWNER           | All     |
| BR-02 | Connection types: PPPoE is automated. DHCP / static IP / Hotspot customers may exist; they get a `connection_type` field, are billed normally, but network automation (provision/suspend/reconnect) applies to `PPPOE` only in the MVP.                               | OWNER + DEFAULT | 2, 5    |
| BR-03 | OLT/ONU equipment may exist. ONU diagnostics stay out of the MVP; brand/model/API access is collected for later.                                                                                                                                                      | OWNER           | 6       |
| BR-04 | **Existing Customer IDs are preserved verbatim** as `customer_code` (free-form string, trimmed, unique case-insensitively). No renumbering. New customers need a generation rule derived from the existing pattern (samples requested, see `docs/phase-0/README.md`). | OWNER           | 2       |
| BR-05 | Billing cycle: calendar month. Invoices are issued on the **1st**, due date is the **10th**, grace period is **3 days** (until the 13th). Late fees: none.                                                                                                            | DEFAULT         | 3       |
| BR-06 | **Auto-suspend is OFF by default.** Admin suspends/reconnects manually; auto-suspend can be enabled later in Settings.                                                                                                                                                | DEFAULT         | 5       |
| BR-07 | Payment allocation: oldest outstanding invoice first (FIFO). Overpayment becomes **customer credit** and is applied automatically to the next issued invoice.                                                                                                         | OWNER           | 3       |
| BR-08 | "First payment" for `FIRST_PAYMENT_REQUIRED` activation = the **full first invoice**.                                                                                                                                                                                 | DEFAULT         | 4       |
| BR-09 | Customers created directly by Admin use the same activation-policy modal as approved leads.                                                                                                                                                                           | DEFAULT         | 4       |
| BR-10 | Staff can search/view **all customers**. Staff tickets: those assigned to them or created by them.                                                                                                                                                                    | DEFAULT         | 2, 4    |
| BR-11 | No collector cash-handover tracking in the MVP (can be added later).                                                                                                                                                                                                  | DEFAULT         | 3       |
| BR-12 | UI is **bilingual (Bangla / English)** with a language switch available at any time; preference stored per user. All UI text comes from dictionaries from Phase 1 onward; no hard-coded strings.                                                                      | OWNER           | 1       |
| BR-13 | bKash: manual Merchant Payment. Verification source order: **statement CSV import first**, SMS-forward only after the approach is validated. Official API only if bKash confirms it applies.                                                                          | OWNER           | 6       |
| BR-14 | **SMS notifications** (see ADR-006): payment reminder 2 days before due date and 1 day before due date; payment-received confirmation.                                                                                                                                | OWNER           | 3       |
| BR-15 | Money is stored as integer poisha (`BIGINT`), timestamps in UTC, displayed in Asia/Dhaka.                                                                                                                                                                             | Blueprint       | All     |
| BR-16 | No hidden charges, late fees, or reconnection fees.                                                                                                                                                                                                                   | Blueprint       | 3       |

## Notification rules (BR-14 detail)

1. "Payment time" is interpreted as the **invoice due date** (the 10th). Reminders go out on the 8th (D-2) and 9th (D-1).
2. A reminder is sent only if the invoice is still `ISSUED` or `PARTIALLY_PAID` with a positive due amount at send time.
3. At most one message per `(invoice, notification type)`; guaranteed by a unique key, so server restarts cannot double-send.
4. A confirmation is sent for every **posted** payment (cash or bKash) with amount, remaining due and receipt number. Reversals do not send "received" messages.
5. Send window 08:00–21:00 Asia/Dhaka; messages generated outside it wait for the next window.
6. Per-customer opt-out flag and preferred language (default Bangla).
7. A monthly SMS budget cap stops sending and alerts Admin instead of silently overspending.

## Open items (defaults will be used if unanswered)

| ID    | Question                                                               | Default                                                    |
| ----- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| OI-01 | Pattern of existing Customer IDs (need 10–20 samples)                  | Free-form, generate new IDs by continuing the pattern      |
| OI-02 | Mid-month joiners: pro-rated first invoice or full month?              | Full monthly price; regular billing starts on the next 1st |
| OI-03 | Extra reminder on the due date itself or after it (overdue)?           | No                                                         |
| OI-04 | SMS delivery: paid gateway or an Android phone with the ISP's own SIM? | Decide after ADR-006 cost comparison                       |
| OI-05 | How is a customer mapped to a router (by area, by package, manual)?    | Manual selection on approval/import                        |
| OI-06 | Staff area restriction later?                                          | No                                                         |
