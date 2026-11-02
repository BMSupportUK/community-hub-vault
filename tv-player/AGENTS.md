# tv-player rules
- BM Player (Android TV/Fire TV/phone) talks to the website only through `/api/public/player` with its device token; logins arrive once via poll and live only in app storage.
- Signed with the permanent BM key; bump versionCode/versionName and upload a new `bm-player/` build row so installs upgrade in place.
- Same tile front screen on every device; "Play with VLC" hands off to org.videolan.vlc and falls back to the built-in Media3 player.
- Sports guide comes from published website guides via the device-token `sports` action; channel matching rules live in src/lib/player-channel-match.ts and are mirrored in MainActivity (keep in step).
- Provider-name equivalents are canonicalized without removing feed numbers, so Sports Pass matches cannot jump to a different numbered channel.
- Playlists download as whole-section lists on one queue (with the progress pop-up) and browse splits them by category locally, so "All" shows at once; posters never draw an overlay — the selected card paints its own ring.
