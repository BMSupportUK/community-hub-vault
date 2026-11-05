# Chromecast in Cast to TV (Android phones)

## What the user sees
- Tapping "Cast to TV" in a phone play menu shows one list of every TV found on the Wi-Fi: Chromecasts, Google TVs and Android TVs with Chromecast built in (Sony, TCL, Hisense, Philips and others), plus the smart TVs that already show up today. Each entry says how it will cast, for example "Living Room TV (Chromecast)" or "Samsung TV (smart TV)".
- Picking a Chromecast starts the channel, film or episode on the TV, with its name showing on screen.
- While casting, a small "Casting to Living Room TV" bar shows on the phone with Pause/Play (films and episodes only) and Stop casting.
- If the TV can't play that stream, the phone says so plainly and offers to try the other stream format.
- TVs and TV boxes still don't show the option (phones only, as now). Fire TV can't take Chromecast, so it still won't appear.

## Known limit (to confirm on a real Chromecast)
Chromecast fetches the video itself, and many provider streams won't play on it:
- Chromecast can't play the plain live format (.ts), so live channels are sent in the m3u8 format.
- Some providers block Chromecast from loading their m3u8 streams.

If testing shows the streams being blocked, the follow-up would be to route Chromecast through the private, per-device stream relay the Mac app already uses. That would be a separate step, and it adds load to the website.

## Steps
1. Add Google's casting library to BM Player, using Google's standard player on the TV, so no Google developer registration is needed.
2. Search for Chromecasts and the existing smart-TV search at the same time, then merge the results into one list.
3. Send to Chromecast: pick the format Chromecast can play (m3u8 for live, the original file for films and episodes), then send the title and poster with it.
4. Add the casting bar on the phone (Stop, plus Pause/Play for films and episodes) and a clear error with a retry in the other format.
5. Add checks for format picking and list merging, then run all BM Player checks.
6. Build and release Android 3.14. This also ships the members-only announcements icon fix, which is already made but not released.

## Technical details
- New dependencies: `com.google.android.gms:play-services-cast-framework` and `androidx.mediarouter`. Add a `CastOptionsProvider` that uses the Default Media Receiver (`CC1AD845`), registered through manifest meta-data.
- New `ChromeCast.java`: MediaRouter discovery using the CAST category selector, `CastSession` and `RemoteMediaClient.load()` with `MediaInfo` (STREAM_TYPE_LIVE or BUFFERED, contentType `application/x-mpegURL` or `video/mp4`, plus metadata).
- `MainActivity` casting flow (lines ~1258–1310): DLNA discovery and Cast route discovery run together for about 4 seconds, feeding one picker with a type tag per entry. `sendToTv` branches between DLNA and Cast. `streamUrls()` supplies the m3u8 variant.
- On TV boxes the Cast library is never started (the same phone check as now), so Fire TV boxes, which lack Play services, aren't affected.
- Pure helpers (`CastFormat.pick`, `CastList.merge`) get unit tests beside the existing Android tests. Update the casting rule in the player's AGENTS.md.
