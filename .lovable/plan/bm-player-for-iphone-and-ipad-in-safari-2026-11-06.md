# BM Player for iPhone and iPad (in Safari)

## What members get
- A "BM Player" page on the website for signed-in members who have a linked app login. It asks for the 6-digit account number each time it opens, the same as the apps do.
- The layout matches the Android/Windows player: the navy colours and home tiles; Live TV with the family preview picture, Now/Up next, a guide grid you can swipe and the sliding Categories/Channels menu; Films/Series posters with Category and Sort; series pages; Catch up; Favourites, Recently watched and star ratings.
- Add to Home Screen gives a BM Player icon that opens full screen. This adds the icon only; there is no offline mode.
- Favourites, ratings, watched progress and viewing hours sync with the other apps.
- Short and major announcements and Live Connections work like they do in the other players.
- On Windows/Mac computers the page points people to the desktop apps.

## Cost
- Video plays straight from the provider's secure address in Safari, so the website pays nothing for video.
- Running costs are only the website pages, guide/list loading and syncing: a few credits a month for normal use.
- Building it is a one-off cost, roughly half the full web player.

## Trade-offs
- The provider address and login reach the phone's browser so Safari can play it, which is less hidden than in the apps. They are fetched only after the unlock, never saved in the browser, and fetched again each session.
- Some providers send the video itself from plain (non-secure) addresses even when the login address is secure. If that happens on a channel, it won't play, and the page will say so. We'll test that first with your provider.
- Formats: Live TV and catch up are always requested from the provider in m3u8, which Safari plays. Your provider already offers both formats, so wrong-format live channels should be rare.
- Films and episodes that aren't mp4 (or m4v/mov) are hidden. A series with no playable episodes is hidden too, and a season with none doesn't show. There's no website conversion and no video ever passes through the website, so there are no data costs.

## Test access
- A private test link, shown only when the page is opened on an iPhone or iPad (including iPads that report themselves as Mac). On other devices the link is hidden, and the page says it's for iPhone/iPad.
- No public pill or launch until you approve.

## Build steps
1. Test: confirm your provider's live, film and catch-up streams play directly in iPhone Safari.
2. A members-only page with the account-number unlock and a choice of linked login.
3. Screens: Home, Live TV + guide, Films, Series, Catch up, Favourites/Recently watched, Settings.
4. Playback in Safari's own player: anti-freeze reconnects, resume/progress, ratings, viewing-hour and Live Connections reporting.
5. The home-screen icon (manifest and icons only), and an "iPhone / iPad" pill on Install Guides.

## Technical details
- Route under `src/routes/_authenticated/player-web/*`. Server functions use `requireSupabaseAuth` and reuse the account-number verify and device-token actions (favourites, votes, progress, announcements, viewing hours), registered as device type "web-ios".
- The guide (EPG) and provider lists are fetched by server functions from the stored login, so CORS isn't needed. Only the playback address goes to the client, after unlock.
- Native `<video>` HLS, no hls.js. Recovery numbers mirror `windows-bm-player/stream-recovery.cjs`.
- Manifest only, with no service worker.
- Add an AGENTS.md rule for the web player.
