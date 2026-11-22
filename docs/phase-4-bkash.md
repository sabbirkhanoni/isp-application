# Phase 4 — bKash payment verification (statement import)

## How it works

Admin downloads the bKash statement (CSV) and uploads it on the **bKash** page. Each row is handled in this order:

1. Transaction ID already imported → counted as _duplicate_ (re-uploading a file is safe).
2. Same transaction ID already entered by hand → _VERIFIED_ if the amount matches, otherwise _NEEDS_REVIEW (amount mismatch)_; such a row can only be ignored.
3. Reference text equals a Customer ID (case-insensitive) → payment is **credited automatically** (FIFO to invoices, surplus becomes credit, receipt issued).
4. Otherwise → _NEEDS_REVIEW_. If the sender number matches exactly one customer it is shown as a suggestion; the admin must still confirm.

Admin can **assign** a row to a customer (credits the payment) or **ignore** it with a reason. Both are audited. Only ADMIN has the `BKASH_RECONCILE` permission.

## API

- `POST /api/v1/bkash/imports` `{fileName, csv}`
- `GET /api/v1/bkash/transactions?status=&page=`
- `POST /api/v1/bkash/transactions/:id/assign` `{customerId}`
- `POST /api/v1/bkash/transactions/:id/ignore` `{reason}`

## Unconfirmed: statement column names

No real bKash statement was available. Column names are matched by aliases in
`apps/api/src/modules/bkash/statement-parser.ts` (`HEADER_ALIASES`). Transaction IDs must be 8–12 letters/digits.
When you have a real statement, send one (with personal data masked); if a column is not recognised, only that alias list needs a one-line change.
Refund, withdrawal, failed and debit rows are skipped and reported.

## Verified

91 API tests, 7 parser tests, web tests, eslint, typecheck, build, and a browser run (upload → auto-credit, assign with phone suggestion, ignore).
