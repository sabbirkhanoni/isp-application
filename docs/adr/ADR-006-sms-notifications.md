# ADR-006 — SMS notifications

Status: **PROPOSED — delivery channel to be chosen (OI-04)**
Date: 2026-11-09

## Requirement (owner)

Send customers an SMS (a) 2 days and 1 day before the payment date and (b) when a payment is received.

## Cost reality

SMS is **not free**. Bangladeshi gateways list roughly ৳0.24 per SMS for bulk and ৳0.53–0.57 for masked sender (e.g. https://sms.automas.com.bd/; prices vary and must be confirmed). Bangla text is Unicode, so a segment holds fewer characters than English and long messages cost more than one segment.

Rough monthly volume for 2,500 customers: 2 reminders (fewer after customers pay) + 1 confirmation ≈ 5,000–7,500 SMS, i.e. about ৳1,200–4,300 per month depending on gateway and segments. This estimate is approximate.

## Channels (both implement one `SmsSender` interface)

|             | A. HTTP SMS gateway              | B. Android phone with ISP's SIM                          |
| ----------- | -------------------------------- | -------------------------------------------------------- |
| Cost        | per-SMS fee, pre-paid            | SIM bundle/pack cost, often cheaper at volume            |
| Reliability | high, delivery reports           | depends on the phone and app staying online              |
| Setup       | account + API key                | an always-on phone running an app that polls our backend |
| Risk        | provider terms, masking approval | operator limits on SMS per day, spam flags               |

## Design

- DB-backed `notification_outbox` with unique key `(invoice_id, type)` or `(payment_id, type)`; the in-process scheduler enqueues and a sender task drains it, so a sleeping server catches up and never double-sends.
- Templates per type and language (bn/en), stored in the database, editable by Admin, with placeholders (name, amount, due date, invoice no., Customer ID).
- Quiet hours, opt-out, monthly budget cap, delivery status, retry with limit (rules in `business-rules.md`, BR-14).
- Messages never contain passwords or router data and never mention late fees.

## Decision needed

Owner picks channel A or B (or both: A primary, B fallback) before Phase 3 notification work begins.
