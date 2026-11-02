# tv-player rules
- BM Player (Android TV/Fire TV/phone) talks to the website only through `/api/public/player` with its device token; logins arrive once via poll and live only in app storage.
- Signed with the permanent BM key; bump versionCode/versionName and upload a new `bm-player/` build row so installs upgrade in place.
- Same tile front screen on every device; "Play with VLC" hands off to org.videolan.vlc and falls back to the built-in Media3 player.
