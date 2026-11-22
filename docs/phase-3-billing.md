# Phase 3 — Billing, Payments, SMS (done)

## Rules implemented

- **Invoices**: one per customer per month (unique), amount = package price at issue time, no proration
  (full price even for customers added mid-month). Billable = ACTIVE, PENDING_ACTIVATION, SUSPENDED (not TERMINATED).
  Due date = the 10th, but never sooner than 3 days after issue. Number format `INV-YYYYMM-<customerCode>`.
- **Generation**: background tick every 5 min (`BACKGROUND_JOBS=true`) + admin button "Generate invoices".
  Idempotent (unique index + per-customer transaction); a sleeping free server simply catches up on wake-up.
- **Payments**: cash (staff + admin) and bKash entry with transaction ID (admin only, ID unique and uppercased).
  Allocation is FIFO (oldest invoice first). Surplus becomes customer credit; credit is applied to the next
  invoice automatically at issue. All in one DB transaction with a per-customer row lock.
- **Reversal** (admin only, reason required): restores invoices, removes surplus credit, cancels the unsent SMS.
  Refused if already reversed or if the surplus credit has already been used.
- **Activation**: `AFTER_FIRST_PAYMENT` customers become ACTIVE when their first invoice is fully paid
  (audit entry `CUSTOMER_ACTIVATED`). `MANUAL` customers never change automatically.
- **SMS** (outbox table + dispatcher): reminders on D-2 and D-1 before the due date for unpaid invoices,
  "payment received" after each payment. One message per (invoice,type)/(payment,type) guaranteed by the database.
  Sent only 08:00–21:00 Dhaka, retried up to 5 times, monthly cap (`SMS_MONTHLY_CAP`), per-customer opt-out flag.
  Driver `log` (default, sends nothing) or `http` (generic JSON gateway; adapt `HttpSmsSender` to the chosen provider).
- Money is stored as integer poisha; all dates follow the Asia/Dhaka calendar.

## Needs the owner's decision later

- SMS provider (then set `SMS_DRIVER=http`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`; adjust payload if needed).
  Bangla SMS is Unicode (~70 chars/segment); `SMS_LOCALE=en` switches to English texts.
- An admin screen to toggle a customer's SMS opt-out is not built yet (column exists).

## Verified

73 API tests (FIFO across months, credit carry-over, reversal rules, concurrent payments, first-payment activation,
bKash rules, reminder dates/idempotency, send window, retries, monthly cap), 5 web tests, typecheck, ESLint,
production build, real-browser flow: create package/customer → generate invoice → receive payment with surplus →
customer becomes active and credit shown → reverse → payment ledger.
