# Backup and restore

## What runs

`.github/workflows/backup.yml` takes a full database dump every night (01:30 Dhaka), encrypts it with your
**age public key**, and keeps it as a private workflow artifact for 30 days (`db-backup`).
Secrets needed in GitHub: `BACKUP_DATABASE_URL` (Supabase direct connection) and `BACKUP_AGE_PUBLIC_KEY`.

## Setup (once)

1. `age-keygen -o backup-key.txt` — the line starting `# public key:` is `BACKUP_AGE_PUBLIC_KEY`.
2. Store `backup-key.txt` (private key) in a password manager and on a second place (e.g. a USB stick).
   **Without it a backup can never be opened.** Never put it in GitHub.
3. Repo → Actions → "Database backup" → Run workflow once and confirm it turns green.

## Every month (2 minutes)

Open Actions → "Database backup" and check the last runs are green. The app's System check screen reminds you.

## Restore

Use a NEW empty Supabase project (or an empty local database), never the live one.

1. Actions → latest "Database backup" run → download artifact `db-backup`, unzip.
2. `scripts/restore-backup.sh backup-YYYY-MM-DD.dump.age backup-key.txt "<empty database url>"`
3. Point the API's `DATABASE_URL` at it and start the API; it applies any newer migrations itself.
4. Log in, open System check, and compare customer/payment counts with the last known figures.

A restore drill (dump → encrypt → restore → row counts equal) was run on 2026-11-15. Repeat it once after setup.

## Data you can download yourself

Admin → System check → "Download your data": customers, invoices, payments as CSV (not a replacement for the backup,
but a readable copy for your own records).
