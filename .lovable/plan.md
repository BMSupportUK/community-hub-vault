# Shorter APK download codes

## Goal
Make the app download link much quicker to type into the Downloader app or a browser: a short address followed by a random 7-digit code, e.g. `https://bmsupport.uk/a/4839201`.

## Current state
- Members get a link like `bmsupport.uk/a/XXXXXXX` where the code is 8 random letters and numbers (generated in `src/lib/app-transfer.functions.ts`, `makeToken()`).
- `/a/:token` (`src/routes/a.$token.ts`) redirects to the real download endpoint `/api/public/a/:token`, which checks the code and streams the APK.

## Changes
1. **7-digit numeric codes** — change `makeToken()` in `src/lib/app-transfer.functions.ts` to generate a random 7-digit number (10 million combinations, links expire after 24 hours, so guessing is not a realistic risk).
2. **Accept digits only** — update the code check in `src/routes/api/public/a/$token.ts` to accept a 7-digit code.
3. **Display stays the same** — the link shown to members is already `bmsupport.uk/a/<code>`, so it will simply become `bmsupport.uk/a/4839201` — quick to read out and type on a TV remote.

Existing links keep working until they expire (within 24 hours); new links get the 7-digit format.

## Technical details
- `makeToken()`: digits `0-9`, length 7, using the existing `randomInt` crypto source.
- `SAFE_TOKEN` regex: `/^\d{7}$/`.
- No database change needed — the token column already stores text.
- Verified in the preview: request a transfer, confirm the link shows a 7-digit code, and confirm typing the short URL downloads the APK.
