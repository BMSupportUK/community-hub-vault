# BM Player security upgrade (all 10 options)

Built in two stages: website first (works with boxes already out there), then new versions of Android, Windows and Mac.

## Stage 1 — Website (no app update needed)

1. **Logins go only to linked boxes** — the website sends an app login only to a box linked to that account that has checked in within the last 3 minutes.
2. **Change a login remotely** — on Link Device and the admin member card, a "Change login" button on each box swaps its login straight away; the old one stops being sent.
3. **Box limit per login** — 3 boxes per app login. Linking a 4th puts it on hold and admins get a "Approve 4th box" request (Approve / Refuse) in BM Player › Logins.
4. **Unusual places warning** — if one login is used from two different countries (or two far-apart towns) inside 30 minutes, admins get an alert and the login is marked "Check sharing" in BM Player › Live.
5. **Remove a box remotely** — Remove (customer on Link Device, admin on member card) unlinks the box; next check-in it is logged out and shows the link code again.
6. **Quiet boxes log out** — a box not used for 60 days is unlinked automatically (daily check) and must be linked again.
7. **New box alert** — customer gets a bell notification + phone alert "A new box was linked to your account" with a "Not me" button that removes it at once and tells admins.
8. **Longer lockouts for guessing** — wrong account numbers: 5 = 15 min (as now), next 5 = 1 hour, next 5 = 24 hours, and admins are alerted at the 24-hour step. A correct number resets it.

## Stage 2 — New app versions (Android 4.09, Windows 0.4.51, Mac 0.1.61)

9. **Hidden passwords** — logins saved in each device's secure vault (Android Keystore, Windows/Mac system keychain), so copied app data is useless. Existing saved logins move across on first open.
10. **Block changed copies** — each app proves on every check-in that it's the genuine signed BM Player; anything else is refused a login. Old genuine versions keep working for 14 days, then must update.
- Apps also obey "removed" (item 5) instantly by clearing the saved login.

## Numbers I've chosen (say if you want different)

- 3 boxes per login · 60 days quiet = logged out · 30 minutes for the different-places check · 14 days grace for old app versions.

## Technical details

- DB: `player_devices` add `revoked_at`, `held_for_limit`; new `player_security_events` (admin/management read); escalating lock fields on device; daily cron route under `/api/public/` with secret header.
- `player.ts` poll/unlock: refuse credential delivery when revoked/held/stale; return `{logged_out:true}` on revoke; geo comparison uses existing Cloudflare geo from `player-live.ts`.
- Integrity: Android Play-less signature check (APK signer SHA-256 + server nonce HMAC with a key compiled into release builds); desktop asar hash + nonce. Treated as a deterrent, not unbreakable.
- Tests beside existing player tests for: box limit 3, 60-day expiry, lockout steps 15m/1h/24h, revoked box gets no login.
