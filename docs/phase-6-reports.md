# Phase 6 — Dashboard and reports

## What the owner gets

- **Dashboard (admin):** for any month — billed, collected (cash / bKash), total unpaid, past-due amount and number of customers, customer counts (active / waiting / suspended), advance balances held, a daily collection chart, and an attention box (bKash payments to check, failed router jobs) with links.
- **Dues page (admin and staff):** who owes money, oldest debt first, with area, phone (tap to call), open bills, days late. Search and "only past due date". Staff use it for collection rounds.
- **CSV downloads (admin):** monthly collections and the dues list. Files open correctly in Excel with Bangla text; money is plain taka so columns can be summed.
- Staff dashboard shows quick links only; money totals stay admin-only.

## Rules

- Months are Dhaka calendar months: a payment at 1 a.m. on 1 December counts in December.
- "Collected" = posted payments received in the month (reversed ones are excluded). "Unpaid" = issued or partly paid bills, any month. "Past due" = unpaid and due date before today.
- CSV cells starting with `= + - @` get a leading `'` so a customer name can never run as a spreadsheet formula.

## API

`GET /reports/summary?period=YYYY-MM` (FINANCE_REPORT_READ), `GET /reports/dues` (INVOICE_READ), `GET /reports/dues.csv`, `GET /reports/collections.csv?period=` (FINANCE_REPORT_READ).

## Verified

10 new API tests (totals, reversal, Dhaka month boundary, permissions, search/overdue filters, CSV content, formula safety); full suite, lint, typecheck, build; browser run of dashboard, dues page and CSV download.
