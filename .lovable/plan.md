# BM Player in the browser (Windows, Mac, iPhone/iPad)

## What members get
- A new "BM Player | Web" page in the Customer Portal, for signed-in members who have a linked app login.
- It asks for the 6-digit account number each time it opens, the same as the apps do.
- The layout matches the Android/Windows player: the same navy colours, home tiles, Live TV with the family preview picture, Now/Up next, the guide grid and the sliding Categories/Channels menu, Films/Series posters with Category and Sort, series pages with season rows, Catch up (clock on channels that have it), Favourites, Recently watched and star ratings.
- On iPhone you can tap Share › Add to Home Screen to get a BM Player icon that opens full screen. This adds the icon only; there is no offline mode.
- Favourites, ratings, watched progress and viewing hours sync with the other apps, because the web player uses the same account.
- Short announcements, major announcements and Live Connections work like they do in the other players.

## Limits to know
- Browsers cannot open the provider's streams directly, so all video passes through our website. That uses website bandwidth for every viewer, and it is the biggest cost and risk of this project.
- iPhone Safari plays only HLS (.m3u8) streams, so iPhone viewers get the m3u8 format. Channels that only offer .ts may not play on iPhone.
- On iPhone, film and series subtitles depend on what Safari supports.
- No sound booster above 100% on iPhone.

## Build steps
1. A members-only page with the account-number unlock and the pick of linked login.
2. A secure stream relay on the website: short-lived tokens, playlists rewritten so provider addresses are never shown, and checks on the member and the connection limit.
3. Screens: Home, Live TV + guide, Films, Series, Catch up, Favourites/Recently watched, Settings.
4. Playback: hls.js on Windows/Mac browsers and native HLS on Safari/iPhone, plus mpegts.js for .ts streams on desktop. Anti-freeze reconnects, progress sync, ratings and viewing-hour reporting.
5. The home-screen icon (manifest and icons only).
6. A download/launch card on Install Guides and a row in the player admin Live Connections ("Web").

## Technical details
- Routes under `src/routes/_authenticated/player-web/*`. Server functions use `requireSupabaseAuth`, and the unlock reuses the existing account-number verify.
- Stream relay at `src/routes/api/public/player-web-stream/$token`. The token is an HMAC that is bound to the member and the stream and expires after a short time. It rewrites m3u8 playlists the same way the Mac `bmstream` proxy does. The Worker streams bodies through without buffering them.
- The existing player logic (EPG parsing, catchupUrl, sort, stream-recovery numbers) is reused from `windows-bm-player` shared modules where they can run in a browser, never copied.
- The web player reports as its own device type, so connection limits and viewing hours count it.
- Manifest only, with no service worker, following the PWA guidance.
- Add an AGENTS.md rule for the web player and the relay.
