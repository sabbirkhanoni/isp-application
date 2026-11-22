# Phase 13 — Admin tools

## SMS wording (Admin → SMS messages)

- Two messages can be reworded: bill reminder and payment received. Words in `{braces}` are filled per customer
  (`{name} {amountDue} {dueDate}` / `{name} {amount} {receipt} {remaining}`). Unknown words are rejected.
- Texts live in `system_settings` (key `sms_templates`), per language. "Use built-in text" removes the custom text.
- A change applies to messages created after saving; messages already queued keep their old text.
- Only the language set by `SMS_LOCALE` is edited/used.

## SMS switch per customer

Customer page → "Do not send SMS to this customer". Stops reminders and payment messages (the flag was already honoured by the sender).

## Extra staff rights (Admin → Users → Rights)

- A staff member keeps the STAFF role and can be given extra rights from a fixed safe list
  (`GRANTABLE_PERMISSIONS` in contracts). User management, expenses, router/SMS settings, activity log,
  payment reversal, lead approval and package pricing can never be granted.
- Stored in `users.extra_permissions` (migration 0009); computed on every request, so changes apply immediately.

## Activity log (Admin → Activity log)

Admin-only list of audit records: everything, sign-ins only, or blocked attempts; date filter (Dhaka days). 30 per page.

## Phone app (PWA)

Manifest + icons + a tiny service worker (`public/sw.js`). Browsers offer "Install / Add to Home screen".
Only the app's own files are cached; `/api` is never cached, so no customer data is stored by it.
New releases appear on the next online page load.

## Security upgrade

`react-router-dom` moved to v7; `npm audit --omit=dev` reports 0 vulnerabilities.

## Deploy

Run the new migration (automatic at start on Render). No new environment variables.
