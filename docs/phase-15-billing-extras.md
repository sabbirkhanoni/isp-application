# Phase 15 — Billing extras

## Invoice lines

Every invoice now has lines (`invoice_lines`): PACKAGE (or PRORATION for a part month), DISCOUNT, ONE_TIME.
`invoice.amount` always equals the sum of its lines. Migration 0010 gave every old invoice one PACKAGE line.

## Discounts

- **Standing monthly discount** (customer page → Billing): taken off every future invoice, never below zero.
- **One-time charge / discount** (connection fee, router sale, fine, goodwill): if this month's invoice exists it is
  added to it at once; otherwise it waits and goes on the next invoice. A waiting charge can be cancelled.
- A reduction can only remove what is still **unpaid** on the invoice (paid money is never silently refunded).
  A discount bigger than the next bill is trimmed and the rest carried to the following invoice.
- Right needed: `BILLING_ADJUST` (admin; can be granted to a staff member in Users → Rights).

## Advance payments

Already supported by customer credit: a payment larger than the bills becomes credit, and each new invoice uses the
credit first. The customer page now says "Advance covers about N month(s)".

## Part-month bills (Admin → Billing and receipts)

- **New customers**: with the switch ON, a customer who joined this month is billed only for the days from the joining
  day to month end (rounded down to a whole poisha). Default OFF (full month, as before).
  Customers loaded by the import have no join date and are never prorated.
- **Customer leaves**: the "Left" button asks whether to reduce this month's unpaid bill for the unused days
  (the leaving day counts as used). A fully paid bill is left alone.

## Move a payment

Customer page → payment → "Move to another customer" (admin, `PAYMENT_REVERSE`). The receipt number and bKash link stay;
the old customer's bills are reopened, the new customer's oldest bills are paid, surplus credit moves too.
Refused if the surplus credit was already used. Recorded in the activity log.

## Printing

Invoice and payment rows have a "Print" link: A4 page or small 80 mm receipt (the choice is remembered).
The header comes from Admin → Billing and receipts (name, address, phone, footer line).

## Deploy

Migration 0010 runs automatically on start. No new environment variables.
