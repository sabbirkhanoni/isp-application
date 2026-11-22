# New Phase 1 — Free/VIP line, Global search, UI overhaul

## Free / VIP line (Never Suspend)

- Customer detail → "Free line" checkbox (admin only). Migration 0013 adds `customers.is_free`.
- Monthly invoice is created with 0 taka (PAID), so records stay complete.
- Auto-suspend skips free lines 100%.

## Global search

- API: GET /api/v1/search?q= (CUSTOMER_READ). Matches name, mobile, customer code, PPPoE username.
- Returns due amount and live online/offline.
- UI: header search box or Ctrl/⌘+K. Arrow keys + Enter. Also jumps to any page.

## UI

- Grouped sidebar with icons, mobile drawer, sticky header, user menu.
- Light / Dark / System theme (button in header).
- New dashboard: collection hero, stat cards, "needs attention", trend charts.
- Skeleton loading, empty states, self-hosted fonts.

Tests: free-and-search.test.ts. Next: Phase 2 (ping, kick session, live bandwidth, MAC lock), then Phase 4 (OLT SNMP).
