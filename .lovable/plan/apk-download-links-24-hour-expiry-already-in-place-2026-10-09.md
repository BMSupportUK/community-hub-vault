# APK download links: 24-hour expiry — already in place

## What Dane asked
He's fine leaving the links on bmsupport.uk, provided each link is disabled after 24 hours and can't be viewed afterwards.

## What I verified in the code (already true today, no behaviour change needed)
1. Every transfer is issued with a 24-hour expiry (`TRANSFER_TTL_MS = 24 * 60 * 60 * 1000` in `src/lib/app-transfer.functions.ts`).
2. The short link `bmsupport.uk/4839201` (`src/routes/$code.ts`) is only a redirect — it holds nothing to view.
3. The download route (`src/routes/api/public/a/$token.ts`) only serves the APK while `expires_at` is in the future; an expired or unknown code gets a bare "Not found" (404) — no download, no page, no member information.
4. The nightly cleanup in `src/routes/api/public/hooks/scheduled-reminders.ts` (line ~358) deletes expired transfers from the database, so dead codes stop existing rather than lingering.
5. Members' Download tab and staff lists filter out expired transfers; staff/admin can also kill a link immediately.

## The one gap worth closing
No automated test locks this rule in — nothing would catch it if a future edit accidentally served expired codes.

## Plan
1. Extract a small pure helper `isTransferLive(expiresAt, nowIso)` (and the token format check) into `src/lib/app-transfer.ts` and use it in `src/routes/api/public/a/$token.ts` — same behaviour, just testable.
2. Add `tests/app-transfer-expiry.test.ts` (bun test) asserting: expiry is exactly 24 hours, a live token passes, a token expired even one second fails, and malformed tokens are rejected.
3. Run the test suite; confirm the build stays clean. No UI or APK changes; nothing to republish for behaviour.

## What this does NOT do
- No change to link format, domain, or how members request transfers.
- The 24-hour rule itself already works — this only protects it from future regressions.
