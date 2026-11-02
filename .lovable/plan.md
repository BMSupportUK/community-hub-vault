# BM Player — IPTV player apps with DNS panel and website login sending

## What you get
1. **BM Player app** for Android TV / Google TV, Fire TV and Android phones (one app, adapts to TV remote or touch).
   - Live TV with categories, Films, Series (seasons/episodes), TV guide (EPG), Favourites and Recently watched.
   - Plays any Xtream-style service: the app uses the DNS from our panel plus the member's username and password.
   - Settings option: "Play with VLC" — opens streams in VLC if it's installed on the device, with a link to get it if not.
2. **BM Player for Windows** (free installer, its own download in Install Guides) with the same sections, linking and DNS.
   - VLC is the player: the installer includes VLC (or installs it if missing), and every channel, film or episode opens in VLC.
3. **DNS panel** in the Admin Dashboard (admin only): one DNS address, editable any time. Changing it updates every linked app on its next open — members never retype anything.
4. **Two ways to send a login to the app**
   - **Code on screen:** the app shows a 6-digit code; on the website the member enters that code with their username and password and taps Send.
   - **From My Logins:** a signed-in member picks a saved login and sends it to a TV or PC they have already linked.

## Build order
1. DNS panel + database (DNS setting, app devices, short-lived link codes, sent logins).
2. Website pages: "Send to app" (code entry) and "Send to my device" on My Logins; linked-device list with remove.
3. Android app (TV, Fire TV, phone) with optional VLC playback.
4. Windows app with VLC bundled as the player.
5. Downloads added to Install Guides; tests for the rules: code expires after 10 minutes and works once; only admin can change DNS; members can only send to their own devices.

## Things to know
- Passwords are never shown in notifications or emails; the app receives them once over a secure connection and stores them only on the device.
- I'll name it **BM Player** with its own look — copying IPTV Smarters' name, logo or exact design isn't allowed.
- VLC is free to include, and we'll show its licence notice in the Windows installer.
- The Windows installer is unsigned (like the Windows Enabler), so Windows may show a "More info › Run anyway" warning.
- Real TV and PC testing will need you to install the apps; I can only build and check them here.

## Technical details
- Tables: `player_settings` (single DNS row, admin-write RLS), `player_devices` (hashed device token, owner user_id, platform), `player_link_codes` (hashed code, 10-min expiry, single use), `player_pending_credentials` (device-scoped, deleted after app fetch).
- Apps talk only to `/api/public/player/*` authenticated by hashed device token (same pattern as the TV Remote helper); code claim and credential fetch via atomic RPCs.
- Android: new `tv-player/` (Kotlin, Media3 ExoPlayer, remote-friendly focus, touch layout), permanent BM key; VLC handoff via `org.videolan.vlc` intent with internal-player fallback.
- Windows: new `windows-player/` (same toolchain as `windows-tv-enabler`), Xtream API catalogue in-app, playback launches bundled `vlc.exe` with the stream URL; public download route with `logDownload`.
