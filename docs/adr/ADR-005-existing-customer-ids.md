# ADR-005 — Preserve existing Customer IDs

Status: **ACCEPTED (owner requirement)**
Date: 2026-11-09

## Context

Customers already have IDs. Issuing new ones to ~1,500–2,500 existing customers is not practical, and bKash payments use the Customer ID as the payment reference.

## Decision

- `customers.customer_code` stores the existing ID **verbatim** (trimmed), `UNIQUE` on a case-insensitive basis. No format is hard-coded.
- Import validates uniqueness and reports duplicates/blank IDs in the preview; it never invents or renumbers IDs.
- For **new** customers, a configurable generator (prefix + zero-padded sequence) continues the existing pattern once samples are provided (OI-01). Admin can also type an ID manually.
- Search and payment matching normalise case and whitespace before comparing.

## Consequences

Matching bKash references requires a clean ID, so the reconciliation queue is the safety net for typos.
