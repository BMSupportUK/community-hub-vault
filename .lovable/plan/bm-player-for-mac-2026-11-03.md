# BM Player for Mac

Build a Mac version of BM Player using the Windows BM Player as the base, and offer it publicly in Install Guides.

## What customers get
- Same screens as Windows and Android: opening film, link code, account-number unlock on every fresh start, Live TV (provider order), Films/Series posters with sort and watched progress, TV guide, Sports guide, multi-screen, reminders, Report a problem, Settings.
- Video plays inside the BM Player window. No separate player app opens.
- Opens full-screen sized (maximised) on launch, like Windows.
- Works on Apple Silicon (M1 to M4) and older Intel Macs (one universal download).

## Install Guides
- New pill **BM Player | Mac** right after **BM Player | Windows**, with a compact download card in the same style as the Windows and iOS cards (not full page).
- The card shows the version, the size, a Download button, and three short steps: open the zip, drag BM Player into Applications, then the first time right-click and choose Open.
- Downloads go through a permanent link that always serves the latest Mac release, and every download is recorded in the download log.

## Limitations
- **Apple security warning.** Without a paid Apple Developer account (£79/year) the app can't be Apple-signed. The first time it opens, Macs say "unidentified developer", so customers need the right-click and Open step once. I can add Apple signing later if you get the account.
- **Download format.** The download is a .zip, not a .dmg, because .dmg files can only be made on a Mac.
- **Untested on a real Mac.** I can't run the app on a real Mac from here, so the first real Mac test will need to be yours.
- **Playback engine.** Mac uses the Mac's own built-in video playback, with stream support added in, rather than VLC. This covers the usual live (.ts / .m3u8) streams and films (mp4/mkv with H.264/HEVC, including 4K on Macs that support it). Rare formats may not play. The "Non 4K Device" message still shows where it applies.

## Technical details
- New `mac-bm-player/` folder, reusing the Windows `core.cjs`, `playback-core.cjs`, `account-gate.cjs`, renderer and the encrypted credential store (macOS safeStorage/Keychain). Shared code stays shared instead of being copied, where possible.
- The Windows-only Koffi/libVLC HWND engine is replaced by a renderer `<video>` engine using bundled hls.js plus mpegts.js. It sits behind the same play/stop/pause/seek/volume/layout interface, so screens don't change. Provider URLs are still built in the main process from the stored DNS and login, and handed to the renderer only as a short-lived local stream proxy (`bmstream://`), never as raw provider URLs.
- Packaged with `@electron/packager --platform=darwin --arch=universal`, an ad-hoc signature, and zipped.
- New `app_builds` identity "BM Player for Mac". Upload the zip first, then switch the row to current.
- New public route `/api/public/player-mac` that mirrors `player-windows`: only `.zip`, a signed URL, Range passthrough, `?info=1`, `logDownload` with source `player_mac`, and the filename `BM-Player-Mac-<version>.zip`.
- Install Guides: a `MacPlayerCard` beside the Windows card, plus the new tab entry.
- `mac-bm-player/AGENTS.md` rules, plus a root AGENTS.md line. Save a memory note that the Mac player is public in Install Guides.
- Tests: the download route serves only the current Mac zip, and the account gate behaves the same as on Windows.
