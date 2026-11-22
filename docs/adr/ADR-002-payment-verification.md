# ADR-002 — Payment verification source (bKash)

Status: **PROPOSED — pending bKash answer (spike S2)**
Date: 2026-11-09

## Context

Customers pay the ISP's bKash Merchant account directly ("manual Merchant Payment"). It is not established that this flow produces an IPN/webhook carrying a customer reference. The owner decided: **statement CSV first, SMS-forward only after validation.**

## Decision

Introduce a `PaymentVerifier`/payment-source adapter in front of one common pipeline (`payment_events` → matching → posting through the same allocation engine as cash). Initial source: **statement CSV import**. SMS-forward and an official API source can be added later without touching the pipeline.

## Rules independent of source

- Unique `(provider, merchant, transaction_id)`; a transaction is credited at most once.
- Auto-credit only when the reference matches an existing Customer ID and the amount is valid; everything else goes to the Admin reconciliation queue.
- An SMS-sourced event is untrusted until cross-checked against the statement (or confirmed by Admin).
- A failed network job never reverses a posted payment.

## Open

bKash's written answers (`docs/phase-0/bkash-merchant-questionnaire.md`) may allow option A (official API/webhook). If so, a new adapter is added; this ADR is then amended.
