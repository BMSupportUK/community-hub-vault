# Shortest possible APK download address

## Goal
Members type the shortest possible address into Downloader or a browser: just `bmsupport.uk/4839201` — the domain plus a random 7-digit code, nothing else.

## Current state
- Members get a link like `bmsupport.uk/a/XXXXXXX` where the code is 8 random letters and numbers (generated in `src/lib/app-transfer.functions.ts`, `makeToken()`).
- `/a/:token` (`src/routes/a.$token.ts`) redirects to the real download endpoint `/api/public/a/:token`, which checks the code and streams the APK.

## Changes
1. **7-digit numeric codes** — change `makeToken()` in `src/lib/app-transfer.functions.ts` to generate a random 7-digit number (10 million combinations, links expire after 24 hours, so guessing is not a realistic risk).
2. **Root-level code address** — add a new server route `src/routes/$code.ts` that only matches a bare 7-digit path (`/4839201`) and redirects to the download endpoint. Any other path is untouched, so normal pages are unaffected.
3. **Accept digits only** — update the code check in `src/routes/api/public/a/$token.ts` to accept a 7-digit code.
4. **Display** — the link shown to members becomes `bmsupport.uk/4839201`; the QR code and copy button use the same short address. The existing `/a/<code>` form keeps working too.

Existing links keep working until they expire (within 24 hours); new links get the 7-digit format.

## Technical details
- `makeToken()`: digits `0-9`, length 7, using the existing `randomInt` crypto source.
- New `src/routes/$code.ts`: server GET handler, regex `^\d{7}$` on the param — non-matching paths return 404 so no page routes are shadowed; matching codes 302 to `/api/public/a/<code>`.
- `SAFE_TOKEN` regex in `src/routes/api/public/a/$token.ts`: `/^\d{7}$/`.
- `AppTransferPanel.tsx`: short URL becomes `${host}/${token}`.
- No database change needed — the token column already stores text.
- Verified in the preview: request a transfer, confirm the link shows `bmsupport.uk/1234567`, and confirm typing that address downloads the APK.
