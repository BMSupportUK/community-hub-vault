# Make the PC/Mac player open as fast as the box

## Why the PC is slow
- **Box:** keeps a saved copy of Live TV, Films and Series on the box, so the lists are there the moment you open the app; the update happens with them already showing.
- **PC/Mac:** keeps nothing between opens. Every start it throws the lists away and downloads all three again one after another (Live TV, then Films, then Series), after setting up the VPN first. Then it loads the TV guide for every channel. The screen stays locked behind the "Updating…" bar until all of that finishes. Films and Series lists are huge, so this takes ages.

## What changes (Windows and Mac)
1. **Saved copy on the computer:** after each successful update, Live TV, Films and Series are saved on the PC (only for that login, wiped on unlink/sign-out like the rest).
2. **Open instantly:** on start, the saved lists show straight away; the startup update still runs every time and swaps in the new lists when ready.
3. **Download all three at once** instead of one after another.
4. **No locked screen when a saved copy exists:** the update and full TV guide load carry on with a small "Updating…" pill. The full guide is still loaded at startup for every channel (unchanged rule); first-ever start or a new login keeps the locked progress screen.
5. Release as Windows 0.4.135 and Mac 0.1.130 once you say release.

## Technical details
- `electron/main.cjs` `catalogue`/`refreshInner`: persist per-login catalogues to an encrypted file in userData (hash of DNS+user as key), hydrate `cache` at startup and emit `catalogues` before refresh; `refreshInner` uses `Promise.all` over kinds and only sends `locked:true` progress when no saved copy existed.
- `device-lock.cjs wipeStore` and login change also delete the saved catalogue file.
- Renderer keeps using the `catalogues` event; add a test that a saved catalogue is served before the network refresh and is cleared on login change/unlink.
