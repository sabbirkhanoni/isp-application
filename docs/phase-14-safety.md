# Phase 14 — Safety before going live

- **System check** (Admin → System check, admin-only): database, migrations, background jobs, SMS driver, router state,
  dry-run flag, secrets, this month's invoices, failed SMS (7 days), failed router jobs, backup reminder.
  Each line is ok / note / check / fix with a plain-language hint. Backups run on GitHub, so the app can only remind.
- **Wrong or doubled information**: same phone on several customers, same PPPoE user name, invalid mobile number,
  PPPoE customer without router, invoice paid above its amount. Samples link to the customer page.
- **Data export**: customers, invoices, payments as Excel-ready CSV (admin-only, recorded as DATA_EXPORTED in the activity log).
- **Backup**: nightly encrypted dump (already in place since Phase 7), new `scripts/restore-backup.sh` and
  `docs/backup-and-restore.md`; a dump → encrypt → restore drill was run.
- **Go-live checklist** in Bangla: `docs/go-live-checklist.bn.md`.
- API: `GET /api/v1/system/check`, `/system/data-quality`, `/system/export/{customers|invoices|payments}`.
- No migration, no new environment variable.
