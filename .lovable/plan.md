# Blacklist upgrade: bulk import and rival-agent alerts

The app already has an admin/management-only blacklist of emails and IP addresses (`/admin-blacklist`). Adding an entry bans any matching existing user, and signup checks it. It currently holds no entries, and there is no public feed of "known IPTV agents" to import from — so the list only ever contains what your team puts in it.

Two additions make it genuinely useful.

## 1. Bulk import

- A **Bulk add** button on the blacklist page opens a dialog with a large paste box.
- Paste any mix of emails and IPs, one per line (commas and spaces also accepted). Each line is auto-detected as email or IP.
- One shared reason applies to the whole batch (e.g. "Known reseller — Telegram sweep, Sept 2026").
- Preview before committing: valid entries, duplicates already on the list, and unparseable lines are shown separately.
- On confirm, entries are added and matching users banned, exactly as single adds do today. A summary reports added / skipped / banned counts.

## 2. Watchlist mode (flag, don't ban)

- Each entry gains a mode: **Block** (current behaviour) or **Watch**.
- A Watch entry never bans anyone. Instead, when a matching email or IP appears at signup or login, a staff notification fires — "Watchlist hit: <value>" with a link to the user — using the existing staff notification system.
- The blacklist page shows mode as a pill and lets staff flip an entry between Block and Watch.
- Useful for suspected rival agents you want to observe rather than tip off.

## Technical notes

- Migration: add `mode text not null default 'block'` to `public.blacklist_entries` with a check constraint of `block` / `watch`; existing rows become `block` so nothing changes for them.
- Blacklist checks (`is_blacklisted` and the signup path) only enforce bans for `mode = 'block'`; `watch` matches instead insert a `staff_notifications` row.
- New server function `bulkAddBlacklist` in `src/lib/blacklist.functions.ts`, same admin/management guard as `addBlacklist`, parsing and validating server-side and reusing the existing ban logic per entry.
- UI changes confined to `src/routes/_authenticated/_approved/admin-blacklist.tsx` (bulk dialog, mode pill, mode toggle).

## Not included

No third-party "known IPTV agent" data source is wired in, because no reliable public list of that kind exists. If you have a list of your own (spreadsheet, text file, Telegram scrape), the bulk import above is the way to load it.
