# BM Player — IPTV player app with DNS panel and website login sending

## What you get
1. **BM Player app** for Android TV / Google TV, Fire TV and Android phones (one app, adapts to TV remote or touch), plus a **web player** on the website.
   - Live TV with categories, Films, Series (seasons/episodes), TV guide (EPG), Favourites and Recently watched.
   - Plays any Xtream-style service: the app uses the DNS from our panel plus the member's username and password.
2. **DNS panel** in the Admin Dashboard (admin only): one DNS address, editable any time. Changing it updates every linked app on its next open — members never retype anything.
3. **Two ways to send a login to the app**
   - **Code on TV:** the app shows a 6-digit code; on the website the member enters that code with their username and password and taps Send.
   - **From My Logins:** a signed-in member picks a saved login and sends it to a TV they have already linked.
4. **Web player page** in the member portal: same Live / Films / Series / Guide sections in the browser.

## Build order
1. DNS panel + database (DNS setting, app devices, short-lived link codes, sent logins).
2. Website pages: "Send to app" (code entry) and "Send to my TV" on My Logins; linked-device list with remove.
3. Native app (new `tv-player/` folder, permanent BM signing key, served from a public download link and added to Install Guides / Direct Install).
4. Web player.
5. Tests for the rules: code expires after 10 minutes and works once; only admin can change DNS; members can only send to their own devices.

## Things to know
- Some services block web browsers (no secure link or cross-site access), so a channel may play in the app but not in the web player. The web player will say so clearly.
- Passwords are never shown in notifications or emails; the app receives them once over a secure connection and stores them only on the device.
- I'll name it **BM Player** with its own look — copying IPTV Smarters' name, logo or exact design isn't allowed.
- Real TV testing will need you to install the APK; I can only build and check it here.

## Technical details
- Tables: `player_settings` (single DNS row, admin-write RLS), `player_devices` (hashed device token, owner user_id), `player_link_codes` (hashed code, 10-min expiry, single use), `player_pending_credentials` (device-scoped, deleted after app fetch).
- App talks only to `/api/public/player/*` authenticated by hashed device token (same pattern as the TV Remote helper); code claim and credential fetch via atomic RPCs.
- Web player proxies Xtream `player_api.php` through a server function to avoid browser cross-site blocks for catalogue data; streams use HLS.js where the service offers `.m3u8`.
- Native app: Kotlin + ExoPlayer (Media3), Leanback-friendly focus for remotes, touch layout for phones.
