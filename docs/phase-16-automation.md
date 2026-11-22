# Phase 16 — Automation

## 1. Automatic suspension (Admin → Billing and receipts)

- A switch plus "grace days". Off by default. Saved in the database, so it applies within 5 minutes without a restart.
- The old `AUTO_SUSPEND` / `AUTO_SUSPEND_GRACE_DAYS` environment values are only the starting default until the owner saves a choice.
- Suspension uses the same safe path as manual suspension (queued router job, audit log). Paying restores the line.

## 2. bKash auto-payments (Admin → bKash auto-payments)

1. Admin presses **Turn on**; a secret token is shown **once** (only its hash is stored). "New token" replaces the old one; "Turn off" stops everything.
2. On the merchant phone, a free "SMS forwarder" app posts each bKash SMS to
   `POST https://<your site>/api/v1/hooks/bkash-sms` with `Authorization: Bearer <token>` and JSON `{"message": "<SMS text>"}`.
3. The system reads amount, TrxID, sender number, time and reference from the text. Messages that are not incoming payments (OTP, send-money…) are ignored.
4. Same rules as the CSV import: duplicate TrxID is never credited twice (retries are safe); a reference equal to a customer ID credits; otherwise, if "match by sender phone" is on and the number belongs to exactly **one** customer, that customer is credited; anything else goes to the bKash review list with a suggestion.
5. Everything is recorded in the audit log and in a daily batch called "SMS forward <date>".

**Unconfirmed:** the SMS wording is matched loosely from the common bKash format. Send a real test payment first; if it lands in "review" with reason "no reference match" or is ignored, send me the exact SMS text and I will adjust the parser.

## 3. Send SMS to customers (Admin → Send SMS to customers)

- Admin-only. Choose status, area, router, "only with unpaid bills"; write the message (`{name}` inserts the name, max 300 chars).
- "Check recipients" shows the count, opted-out customers skipped, and a sample. Max 2000 recipients per send.
- Messages join the normal SMS queue: send window 08:00–21:00 Dhaka and the monthly cap still apply. Logged in the audit log.

## 4. Owner alerts (SMS to OWNER_PHONE)

- A router with no contact for 10 minutes → one "not responding" SMS; one "back online" SMS on recovery.
- If a router had at least 10 customers online and half of them disappear at once → one warning (at most once an hour).
- State is stored in the database, so restarts never repeat an alert. Needs `OWNER_PHONE` and a working SMS driver.

## Migration

`0011_automation` adds the `BULK` SMS type.

## Test it

Automatic checks: `test/automation.test.ts`, `test/bkash-hook.test.ts`, `src/modules/bkash/sms-parser.test.ts`.
